'use client'
import { useEffect, useMemo, useState } from 'react'
import { addD, dmy, inr, nDays, todayIST } from '@/lib/util'
import { Ic } from './icons'

const ERR = (m: string) => m.includes('CLEAN_CONFLICT') ? 'This dress is booked or with a customer during those dates.' : m.includes('ALREADY_CLEANING') ? 'This dress is already out for dry cleaning.' : m
const retDate = (b: any) => b.returned_at ? new Date(b.returned_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}) : b.end_date

// The dashboard shortcut now adds the dress to the queue. Only Send to Cleaner marks it physically away.
export async function sendForDryCleaning(ctx: any, pre?: any) {
  const eligible = ctx.D.filter((d:any)=>!['archived','retired','maintenance'].includes(d.status)&&!ctx.CR.some((r:any)=>r.dress_id===d.id&&['to_be_sent','sent','returned_pending_check'].includes(r.status))&&!ctx.DC.some((r:any)=>r.dress_id===d.id&&!r.returned_on))
  const v = await ctx.ask('Add dress to cleaning list',[{name:'d',label:'Dress',options:eligible.map((d:any)=>`${d.code} · ${d.name}`),value:pre?`${pre.code} · ${pre.name}`:undefined,required:true},{name:'condition',label:'Condition at return',options:['Minor Marks','Needs Cleaning'],required:true},{name:'notes',label:'Condition notes'}],{ok:'Add to To Be Sent',note:'The dress remains at the shop until staff confirm Send to Cleaner.'})
  if(!v)return
  const d=eligible.find((x:any)=>`${x.code} · ${x.name}`===v.d);if(!d)return ctx.say('Choose a dress.')
  const {error}=await ctx.sb.from('dry_clean_requests').insert({dress_id:d.id,status:'to_be_sent',condition:v.condition==='Minor Marks'?'minor_marks':'needs_cleaning',condition_notes:v.notes.trim()||null,notes:v.notes.trim()||null})
  ctx.say(error?ERR(error.message):`${d.code} added to To Be Sent.`);ctx.load()
}

export default function DryCleaning({ctx}:{ctx:any}){
  const today=todayIST(),[tab,setTab]=useState<'to_send'|'sent'|'returned'|'history'>('to_send'),[q,setQ]=useState('')
  const CR:any[]=ctx.CR||[],DC:any[]=ctx.DC||[], owner=ctx.owner
  const active=useMemo(()=>CR.filter((r:any)=>r.status==='to_be_sent'||r.status==='sent'||r.status==='returned_pending_check'),[CR])
  const queue=active.filter((r:any)=>r.status==='to_be_sent'), sent=active.filter((r:any)=>r.status==='sent'), returned=active.filter((r:any)=>r.status==='returned_pending_check'), history=CR.filter((r:any)=>r.status==='complete')
  const matches=(r:any)=>{const d=ctx.dmap[r.dress_id];return !q||`${d?.code} ${d?.name} ${r.vendor||''}`.toLowerCase().includes(q.toLowerCase())}
  const nextBooking=(did:string)=>ctx.B.filter((b:any)=>b.dress_id===did&&b.status!=='cancelled'&&b.start_date>=today).sort((a:any,b:any)=>a.start_date.localeCompare(b.start_date))[0]
  const toSend=(r?:any)=>sendForDryCleaning(ctx,r?ctx.dmap[r.dress_id]:undefined)
  async function dispatch(r:any){
    const d=ctx.dmap[r.dress_id],sentOn=today,est=String(d?.dry_clean_charge||0)
    const v=await ctx.ask('Send to Cleaner',[{name:'vendor',label:'Cleaner / vendor name',required:true},{name:'sent',label:'Date sent',type:'date',value:sentOn,required:true},{name:'expected',label:'Expected return date',type:'date',value:addD(sentOn,3),required:true},{name:'cost',label:'Estimated cleaning cost (₹)',type:'number',value:est},{name:'notes',label:'Dispatch notes'}],{ok:'Confirm dispatch',note:'This confirms that the dress has physically left the shop. It will be unavailable for bookings until returned and approved.'});if(!v)return
    if(v.expected<v.sent)return ctx.say('Expected return cannot be before the date sent.')
    const {data:dc,error}=await ctx.sb.from('dry_cleanings').insert({dress_id:r.dress_id,sent_on:v.sent,expected_back:v.expected,charge:+(v.cost||0),notes:v.notes.trim()||r.condition_notes||null}).select('id').single()
    if(error)return ctx.say(ERR(error.message))
    const actor=(await ctx.sb.auth.getUser()).data.user?.id
    const up=await ctx.sb.from('dry_clean_requests').update({status:'sent',vendor:v.vendor.trim(),sent_on:v.sent,sent_by:actor||null,expected_back:v.expected,estimated_charge:+(v.cost||0),notes:v.notes.trim()||null,dry_cleaning_id:dc.id}).eq('id',r.id)
    ctx.say(up.error?'Dress dispatched; queue update needs attention.':`${d?.code||'Dress'} sent to ${v.vendor}.`);ctx.load()
  }
  async function markReturned(r:any){
    const v=await ctx.ask('Returned from Cleaner',[{name:'date',label:'Actual return date',type:'date',value:today,required:true},{name:'cost',label:'Final cleaning cost (₹)',type:'number',value:String(r.estimated_charge||0),required:true},{name:'condition',label:'Condition after cleaning',options:['Ready','Maintenance required','Alteration required'],required:true},{name:'notes',label:'Final inspection notes'}],{ok:'Record return for inspection',note:'This records that the dress is back at the shop. Confirm availability only after the final inspection.'});if(!v)return
    const {error}=await ctx.sb.from('dry_cleanings').update({charge:+v.cost,notes:[r.notes,v.notes].filter(Boolean).join(' · ')||null}).eq('id',r.dry_cleaning_id)
    if(error)return ctx.say(ERR(error.message))
    const actor=(await ctx.sb.auth.getUser()).data.user?.id
    const up=await ctx.sb.from('dry_clean_requests').update({status:'returned_pending_check',returned_on:v.date,returned_by:actor||null,final_charge:+v.cost,returned_condition:v.condition,return_notes:v.notes.trim()||null}).eq('id',r.id)
    if(up.error)return ctx.say('Dress is back, but the final inspection could not be saved.')
    const paid=await ctx.sb.from('cash_expenses').select('id').eq('dry_cleaning_id',r.dry_cleaning_id).is('voided_at',null).maybeSingle()
    if(!paid.data&&+v.cost>0){const pay=await ctx.ask('Record cleaner payment?', [{name:'mode',label:'Payment mode',options:['Cash','GPay / UPI','Card','Bank transfer','Not paid yet'],value:'Cash'}],{ok:'Continue',note:`Final charge ${inr(+v.cost)}. If already paid, select the payment mode used.`});if(pay&&pay.mode!=='Not paid yet') await ctx.sb.rpc('record_wash_payment',{p_wash:r.dry_cleaning_id,p_mode:pay.mode})}
    ctx.say('Dress returned and is waiting for final inspection.');ctx.load()
  }
  async function finish(r:any,route:'ready'|'maintenance'|'alteration'){
    const d=ctx.dmap[r.dress_id]
    if(route==='ready'){
      const v=await ctx.ask('Confirm & Make Available',[{name:'note',label:'Final inspection note (optional)',value:r.return_notes||''}],{ok:'Make available',note:`Confirm ${d?.code||'this dress'} passed its final inspection.`});if(!v)return
      const result=await ctx.sb.from('dry_clean_requests').update({status:'complete',completed_at:new Date().toISOString(),completed_by:(await ctx.sb.auth.getUser()).data.user?.id||null,return_notes:v.note.trim()||null}).eq('id',r.id)
      if(result.error)return ctx.say(result.error.message)
      await ctx.sb.from('dry_cleanings').update({returned_on:r.returned_on}).eq('id',r.dry_cleaning_id)
      await ctx.sb.from('dresses').update({status:'available',condition:v.note.trim()||'Ready after dry cleaning'}).eq('id',r.dress_id)
      ctx.say(`${d?.code||'Dress'} confirmed available.`)
    }else if(route==='maintenance'){
      const v=await ctx.ask('Route to Maintenance',[{name:'note',label:'Maintenance issue',value:r.return_notes||'',required:true}],{ok:'Route to maintenance'});if(!v)return
      await ctx.sb.from('dresses').update({status:'maintenance',condition:v.note.trim()}).eq('id',r.dress_id)
      await ctx.sb.from('dry_cleanings').update({returned_on:r.returned_on}).eq('id',r.dry_cleaning_id)
      await ctx.sb.from('admin_notifications').insert({target_role:'owner',kind:'maintenance',title:'Maintenance review needed',body:`${d?.code||'Dress'} returned from cleaner: ${v.note.trim()}`})
      await ctx.sb.from('dry_clean_requests').update({status:'complete',completed_at:new Date().toISOString(),return_notes:v.note.trim()}).eq('id',r.id);ctx.say(`${d?.code||'Dress'} routed to maintenance.`)
    }else{
      const book=nextBooking(r.dress_id);if(!book)return ctx.say('An alteration workflow needs an upcoming booking for this dress. Add the alteration from the booking details or Alterations page.')
      const v=await ctx.ask('Route to Alterations',[{name:'requirements',label:'Alteration requirements',value:r.return_notes||'',required:true}],{ok:'Create alteration job'});if(!v)return
      const {error}=await ctx.sb.from('alteration_jobs').insert({booking_id:book.id,dress_id:r.dress_id,requirements:v.requirements.trim(),status:'pending_dispatch'})
      if(error)return ctx.say(error.message)
      await ctx.sb.from('dresses').update({status:'maintenance',condition:'Awaiting alteration'}).eq('id',r.dress_id)
      await ctx.sb.from('dry_cleanings').update({returned_on:r.returned_on}).eq('id',r.dry_cleaning_id)
      await ctx.sb.from('dry_clean_requests').update({status:'complete',completed_at:new Date().toISOString()}).eq('id',r.id);ctx.say('Alteration job created.');ctx.go('alterations')
    }
    ctx.load()
  }
  const count=CR.filter((r:any)=>r.status==='complete').length, expenses=CR.filter((r:any)=>r.status==='complete').reduce((s:number,r:any)=>s+(r.final_charge||r.estimated_charge||0),0)
  const cell=(r:any)=>{const d=ctx.dmap[r.dress_id];return <div className="dr">{ctx.thumb(d,40,52)}<div><b>{d?.code||'—'}</b><span>{d?.name||'Dress'}</span></div></div>}
  const pill=(s:string)=> <span className="bdg" style={{'--c':s==='sent'?'var(--purple)':s==='returned_pending_check'?'var(--amber)':'var(--blue)'} as any}>{s==='sent'?'With Cleaner':s==='returned_pending_check'?'Returned · Inspect':'To Be Sent'}</span>
  const tabs:[typeof tab,string,number][]=[['to_send','To Be Sent',queue.length],['sent','Sent to Cleaner',sent.length],['returned','Returned from Cleaner',returned.length],['history','History',history.length]]
  const summary=[['To Be Sent',queue.length,'clock','var(--amber)'],['With Cleaner',sent.length,'sparkle','var(--purple)'],['Returned',returned.length,'check','var(--green)'],['Cleaning Expenses',inr(expenses),'coins','var(--wine)']]
  const visible=(list:any[])=>list.filter(matches)
  return <div className="dry-page">
    <div className="pg-head"><div><h1>Dry Cleaning &amp; Dress Care</h1><p>Manage dresses that require cleaning, track dresses sent to cleaners, monitor return status, costs and turnaround time.</p></div><button className="btn" onClick={()=>toSend()}>＋ Add Dress to Cleaning List</button></div>
    <div className="k6 dry-cards">{summary.map(([l,v,ic,c]:any)=><div className="kc" key={l} style={{'--c':c} as any}><Ic n={ic} s={28}/><div><b>{v}</b><span>{l}</span></div></div>)}</div>
    <div className="bk-bar dry-tools"><div className="bk-search"><Ic n="search" s={18}/><input placeholder="Search dress code, name or cleaner" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <div className="bk-tabs">{tabs.map(([k,l,n])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}<span className="n">{n}</span></button>)}</div>
    {tab==='to_send'&&<div className="bk-card-t scroll"><table className="bt"><thead><tr><th>Dress</th><th>Returned on</th><th>Condition at return</th><th>Condition notes</th><th>Next booking</th><th>Priority</th><th>Action</th></tr></thead><tbody>{visible(queue).map((r:any)=>{const b=nextBooking(r.dress_id),days=b?nDays(today,b.start_date)-1:null,priority=days!==null&&days<=3?'Critical':days!==null&&days<=7?'High':days!==null&&days<=14?'Plan':'Normal';return <tr key={r.id}><td>{cell(r)}</td><td>{r.booking_id?dmy(retDate(ctx.B.find((x:any)=>x.id===r.booking_id)||{})):dmy(r.added_at?.slice(0,10))}</td><td>{r.condition==='minor_marks'?'Minor Marks':'Needs Cleaning'}</td><td style={{whiteSpace:'normal',minWidth:160}}>{r.condition_notes||'—'}</td><td>{b?dmy(b.start_date):'No booking'}</td><td><span className="bdg" style={{'--c':priority==='Critical'?'var(--red)':priority==='High'?'var(--amber)':'var(--mut)'} as any}>{priority}{days!==null?` · ${days}d`:''}</span></td><td><button className="btn sm" onClick={()=>dispatch(r)}>Send to Cleaner</button></td></tr>})}{!visible(queue).length&&<tr><td colSpan={7} className="mut">No dresses waiting to be sent.</td></tr>}</tbody></table></div>}
    {tab==='sent'&&<div className="bk-card-t scroll"><table className="bt"><thead><tr><th>Dress</th><th>Cleaner</th><th>Date sent</th><th>Expected return</th><th>Next booking</th><th>Estimated cost</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible(sent).map((r:any)=>{const b=nextBooking(r.dress_id),days=b?nDays(today,b.start_date)-1:null,late=r.expected_back<today,risk=days!==null&&days<=3;return <tr key={r.id} className={late||risk?'od':''}><td>{cell(r)}</td><td>{r.vendor||'—'}</td><td>{dmy(r.sent_on)}</td><td>{dmy(r.expected_back)}{late&&<div className="bad"><b>OVERDUE</b></div>}</td><td>{b?<span className={risk?'bad':''}>{dmy(b.start_date)} · {days} day{days===1?'':'s'}{risk?' · CRITICAL':''}</span>:'—'}</td><td>{inr(r.estimated_charge)}</td><td>{pill('sent')}</td><td><button className="btn sm" onClick={()=>markReturned(r)}>Mark as Returned</button></td></tr>})}{!visible(sent).length&&<tr><td colSpan={8} className="mut">No dresses are with a cleaner.</td></tr>}</tbody></table></div>}
    {tab==='returned'&&<div className="bk-card-t scroll"><table className="bt"><thead><tr><th>Dress</th><th>Cleaner</th><th>Returned on</th><th>Final cost</th><th>Condition after cleaning</th><th>Notes</th><th>Next action</th></tr></thead><tbody>{visible(returned).map((r:any)=><tr key={r.id}><td>{cell(r)}</td><td>{r.vendor||'—'}</td><td>{dmy(r.returned_on)}</td><td>{inr(r.final_charge||0)}</td><td>{r.returned_condition||'Inspection needed'}</td><td style={{whiteSpace:'normal'}}>{r.return_notes||'—'}</td><td><div className="dry-actions"><button className="btn sm" onClick={()=>finish(r,'ready')}>Confirm &amp; Make Available</button><button className="btn alt sm" onClick={()=>finish(r,'maintenance')}>Maintenance</button><button className="btn alt sm" onClick={()=>finish(r,'alteration')}>Alteration</button></div></td></tr>)}{!visible(returned).length&&<tr><td colSpan={7} className="mut">No returned dresses are waiting for inspection.</td></tr>}</tbody></table></div>}
    {tab==='history'&&<div className="bk-card-t scroll"><table className="bt"><thead><tr><th>Dress</th><th>Added to list</th><th>Added by</th><th>Condition at return</th><th>Date sent</th><th>Cleaner</th><th>Sent by</th><th>Date returned</th><th>Returned by</th><th>Final cost</th><th>Return notes</th><th>Status</th></tr></thead><tbody>{visible(history).map((r:any)=><tr key={r.id}><td>{cell(r)}</td><td>{dmy(r.added_at?.slice(0,10))}</td><td>{ctx.staffName(r.added_by)||'—'}</td><td>{r.condition}</td><td>{r.sent_on?dmy(r.sent_on):'—'}</td><td>{r.vendor||'—'}</td><td>{ctx.staffName(r.sent_by)||'—'}</td><td>{r.returned_on?dmy(r.returned_on):'—'}</td><td>{ctx.staffName(r.returned_by)||'—'}</td><td>{inr(r.final_charge||r.estimated_charge||0)}</td><td style={{whiteSpace:'normal'}}>{r.return_notes||r.condition_notes||'—'}</td><td>Completed</td></tr>)}{!visible(history).length&&<tr><td colSpan={12} className="mut">No completed cleaning records yet.</td></tr>}</tbody></table></div>}
  </div>
}
