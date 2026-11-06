'use client'
import { useEffect, useRef, useState } from 'react'
import { inr, istTime } from '@/lib/util'
import { Ic } from './icons'

export default function Notifications({ctx}:{ctx:any}){
 const [open,setOpen]=useState(false),[mode,setMode]=useState<'approvals'|'recent'>('approvals'),ref=useRef<HTMLDivElement>(null)
 const pending=(ctx.APPR||[]).filter((a:any)=>a.status==='pending'), visible=(ctx.NOTIFS||[]).filter((n:any)=>n.target_role==='all'||n.target_role===(ctx.owner?'owner':'staff'))
 const count=ctx.owner?pending.length:visible.filter((n:any)=>!n.read_at).length
 useEffect(()=>{const click=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',click);return()=>document.removeEventListener('mousedown',click)},[])
 async function decide(a:any,approve:boolean){const note=await ctx.ask(approve?'Approve request?':'Reject request?',[{name:'note',label:'Note for the team (optional)'}],{ok:approve?'Approve':'Reject',note:`${a.action_type==='shortfall'?`Shortfall ${inr(a.shortfall)} · `:''}Booking ${a.booking_id}`});if(!note)return;const {error}=await ctx.sb.rpc('decide_approval',{p_id:a.id,p_approve:approve,p_note:note.note});if(error){ctx.say(error.message.includes('FORBIDDEN')?'Only the owner can decide approvals.':'Could not save the decision.');return}await ctx.sb.from('admin_notifications').update({read_at:new Date().toISOString()}).eq('booking_id',a.booking_id).eq('kind','approval').is('read_at',null);ctx.say(approve?'Request approved.':'Request rejected.');ctx.load()}
 async function markRead(n:any){if(n.read_at)return;await ctx.sb.from('admin_notifications').update({read_at:new Date().toISOString()}).eq('id',n.id);ctx.load()}
 const title=(a:any)=>a.action_type==='shortfall'?'Payment shortfall':a.action_type==='discount'?'Discount approval':a.action_type==='refund'?'Refund approval':'Booking cancellation'
 const body=(a:any)=>a.action_type==='shortfall'?`Short by ${inr(a.shortfall)} · ${ctx.staffName(a.requested_by)||'Staff'} · ${a.reason||'No reason provided'}`:`${a.action_type==='discount'||a.action_type==='refund'?inr(a.request_details?.amount||0)+' · ':''}${ctx.staffName(a.requested_by)||'Staff'} · ${a.reason||a.request_details?.reason||'Review requested'}`
 return <div className="notif-wrap" ref={ref}><button className="notif-bell" aria-label={`Notifications${count?`, ${count} unread`:''}`} onClick={()=>setOpen(!open)}><Ic n="bell" s={20}/>{count>0&&<span>{count>99?'99+':count}</span>}</button>
  {open&&<section className="notif-pop"><header><div><b>Notifications</b><small>{ctx.owner?`${pending.length} pending approval${pending.length===1?'':'s'}`:`${visible.filter((n:any)=>!n.read_at).length} unread`}</small></div><button aria-label="Close notifications" onClick={()=>setOpen(false)}>×</button></header>
   <div className="notif-tabs">{ctx.owner&&<button className={mode==='approvals'?'on':''} onClick={()=>setMode('approvals')}>Pending Approvals <b>{pending.length}</b></button>}<button className={mode==='recent'?'on':''} onClick={()=>setMode('recent')}>Recent</button></div>
   <div className="notif-list">{mode==='approvals'&&ctx.owner?pending.map((a:any)=><article className="notif-card approval" key={a.id}><div className="notif-mark"><Ic n={a.action_type==='shortfall'?'wallet':a.action_type==='refund'?'ret':'calcheck'} s={19}/></div><div className="notif-body"><button className="notif-title" onClick={()=>ctx.openBooking(a.booking_id)}>{title(a)} · {a.booking_id}</button><p>{body(a)}</p><small>{istTime(a.requested_at)}</small><div className="notif-actions"><button className="btn alt sm" onClick={()=>decide(a,false)}>Reject</button><button className="btn sm" onClick={()=>decide(a,true)}>Approve</button></div></div></article>):null}
    {mode==='recent'&&visible.slice(0,40).map((n:any)=><button className={'notif-card recent'+(!n.read_at?' unread':'')} key={n.id} onClick={()=>{markRead(n);if(n.booking_id)ctx.openBooking(n.booking_id)}}><span className="notif-mark"><Ic n={n.kind==='approval'?'bell':n.kind==='alteration'?'scissors':n.kind==='dry_cleaning'?'sparkle':'warn'} s={18}/></span><span className="notif-body"><b>{n.title}</b><p>{n.body}</p><small>{istTime(n.created_at)}{n.booking_id?` · ${n.booking_id}`:''}</small></span></button>)}
    {mode==='approvals'&&ctx.owner&&!pending.length&&<p className="mut notif-empty">No pending approvals.</p>}{mode==='recent'&&!visible.length&&<p className="mut notif-empty">No recent notifications.</p>}
   </div></section>}
 </div>
}
