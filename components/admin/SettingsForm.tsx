'use client'

// The owner's Settings form (cleaning days, deposit rules, alert timing, late-fee grace days, receipt details). Moved out of AdminApp.tsx (N-17).
export default function SettingsForm({ sb, st, say, load }: { sb: any; st: any; say: (m: string) => void; load: () => unknown }) {
  return (
    <form className="box" style={{ margin: 0 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const { error } = await sb.from('settings').update({ buffer_days: +(f.get('b') as string), advance_pct: +(f.get('a') as string), advance_min: +(f.get('m') as string), alert_horizon_days: +(f.get('ah') as string), clean_lead_days: +(f.get('cl') as string), alert_idle_days: +(f.get('ai') as string), alt_soon_days: +(f.get('as') as string), measure_by_days: +(f.get('mb') as string), send_by_days: +(f.get('sd') as string), tailor_days: +(f.get('td') as string), late_grace_days: +(f.get('lg') as string) || 0, shop_name: String(f.get('sn') || '').trim() || 'Swaasa Wedding Rentals', shop_phone: String(f.get('sp') || '').trim(), shop_address: String(f.get('sa') || '').trim(), agreement_terms: String(f.get('at') || '').trim() }).eq('id', 1); say(error ? error.message : 'Settings saved'); load() }}>
        <h3>Settings</h3><div className="flt" style={{ justifyContent: 'flex-start' }}><label style={{ margin: 0 }}>Cleaning and preparation days after each return<input name="b" type="number" min="0" max="7" defaultValue={st.buffer_days} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Refundable deposit: % of rent<input name="a" type="number" min="0" max="100" defaultValue={st.advance_pct} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Refundable deposit: minimum ₹ (the higher of the two applies)<input name="m" type="number" min="0" defaultValue={st.advance_min ?? 1000} style={{ display: 'block' }} /></label>
        </div>
        <h4 style={{ margin: '14px 0 4px' }}>Alert timing (days)</h4>
        <div className="flt" style={{ justifyContent: 'flex-start' }}>
          <label style={{ margin: 0 }}>Look ahead for preparation problems<input name="ah" type="number" min="1" max="30" defaultValue={st.alert_horizon_days ?? 7} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Time a dress in To Be Sent needs before delivery<input name="cl" type="number" min="1" max="14" defaultValue={st.clean_lead_days ?? 3} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Warn about an item waiting to be sent after<input name="ai" type="number" min="1" max="30" defaultValue={st.alert_idle_days ?? 3} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>&ldquo;Alteration due soon&rdquo; window<input name="as" type="number" min="1" max="14" defaultValue={st.alt_soon_days ?? 2} style={{ display: 'block' }} /></label></div>
        <h4 style={{ margin: '14px 0 4px' }}>Checkpoints for dresses with alterations (days before delivery)</h4>
        <div className="flt" style={{ justifyContent: 'flex-start' }}>
          <label style={{ margin: 0 }}>Measurements must be taken by<input name="mb" type="number" min="1" max="30" defaultValue={st.measure_by_days ?? 5} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Dress must be with the tailor by<input name="sd" type="number" min="1" max="30" defaultValue={st.send_by_days ?? 4} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Usual tailor turnaround (days)<input name="td" type="number" min="1" max="21" defaultValue={st.tailor_days ?? 3} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Free days after the return date before a late fee starts<input name="lg" type="number" min="0" max="14" defaultValue={st.late_grace_days ?? 0} style={{ display: 'block' }} /></label>
          <h4 style={{ margin: '14px 0 2px' }}>Receipt and rental agreement</h4>
          <label style={{ margin: 0 }}>Shop name<input name="sn" defaultValue={st.shop_name || 'Swaasa Wedding Rentals'} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Shop phone<input name="sp" defaultValue={st.shop_phone || ''} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Shop address<input name="sa" defaultValue={st.shop_address || ''} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Terms printed on the receipt<textarea name="at" rows={9} defaultValue={st.agreement_terms || ''} style={{ display: 'block', width: '100%' }} /></label>
          <small className="mut">These terms are a starting template. Please read them and change them to match your shop&rsquo;s own policy before giving them to customers.</small></div>
        <p className="mut" style={{ fontSize: 12 }}>A warning appears on the bell and the Today list when one of these dates passes and the step is still not done. The turnaround is used for the warning when a booking is taken with too little time.</p>
        <p className="mut" style={{ fontSize: 12 }}>A changed cleaning period applies to new bookings. Bookings already made keep the gap they were made with.</p><button className="btn">Save settings</button></form>
  )
}
