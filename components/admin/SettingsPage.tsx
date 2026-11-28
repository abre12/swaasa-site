'use client'
import { useRef, useState } from 'react'
import { Ic } from './icons'
import StaffAdmin from './StaffAdmin'
import MfaSetup from './MfaSetup'
import FaqSettings from './FaqSettings'
import HomeImagesSettings from './HomeImagesSettings'
import CustomerStoriesSettings from './CustomerStoriesSettings'

// The owner's Settings page: a list of topics on the left and one panel per topic on the right.
// Every setting that used to sit in one long page is still here, grouped by what it controls.
// Each topic saves on its own and only writes its own columns. All panels stay mounted (just hidden),
// so something typed in one topic is not lost when the owner looks at another before saving.

const TABS = [
  { id: 'profile', label: 'Business Profile', icon: 'store', title: 'Business profile', sub: 'Shop details printed on every receipt and rental agreement.' },
  { id: 'staff', label: 'Staff Management', icon: 'users', title: 'Staff management', sub: 'Give each person their own login, so every action is recorded under their name.' },
  { id: 'pricing', label: 'Pricing Rules', icon: 'percent', title: 'Pricing rules', sub: 'How the refundable deposit is worked out, and when late fees begin.' },
  { id: 'policies', label: 'Booking Policies', icon: 'calcheck', title: 'Booking policies', sub: 'The gap kept between rentals, and the terms customers agree to.' },
  { id: 'alterations', label: 'Alterations', icon: 'scissors', title: 'Alterations', sub: 'Checkpoints for dresses that need alterations before delivery.' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', title: 'Notifications', sub: 'When the bell and the Today list should warn you about preparation.' },
  { id: 'security', label: 'Security', icon: 'lock', title: 'Security', sub: 'Two-step login for the owner account.' },
  { id: 'faqs', label: 'FAQs', icon: 'help', title: 'Public FAQs', sub: 'Manage the questions and answers shown on your website.' },
  { id: 'images', label: 'Home Images', icon: 'camera', title: 'Homepage category images', sub: 'Edit the Find your look caption and change, add or remove category images and cards.' },
  { id: 'stories', label: 'Customer Stories', icon: 'camera', title: 'Customer stories', sub: 'Edit customer reviews, manage their photos, and add photo-only gallery entries.' },
] as const
type TabId = typeof TABS[number]['id']

function Num({ name, label, hint, min, max, def, unit, prefix }: { name: string; label: string; hint?: string; min?: number; max?: number; def: number; unit?: string; prefix?: string }) {
  return <label className="stg-f"><span className="stg-l">{label}</span>
    <span className={'stg-num' + (prefix ? ' pre' : '')}>{prefix && <i className="stg-u l">{prefix}</i>}<input name={name} type="number" inputMode="numeric" min={min} max={max} defaultValue={def} />{unit && <i className="stg-u r">{unit}</i>}</span>
    {hint && <small>{hint}</small>}</label>
}

function Txt({ name, label, hint, def, span, type = 'text', inputMode }: { name: string; label: string; hint?: string; def: string; span?: boolean; type?: string; inputMode?: 'tel' | 'text' }) {
  return <label className={'stg-f' + (span ? ' stg-span' : '')}><span className="stg-l">{label}</span><input name={name} type={type} inputMode={inputMode} defaultValue={def} />{hint && <small>{hint}</small>}</label>
}

function Group({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return <div className="stg-grp">{title && <h3 className="stg-gh">{title}</h3>}{sub && <p className="stg-gd">{sub}</p>}{children}</div>
}

// One topic = one form with its own Save button. `build` turns the form's values into the columns to update.
function SaveForm({ ctx, build, children }: { ctx: any; build: (g: (k: string) => string) => Record<string, unknown>; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false)
  return <form onSubmit={async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true)
    const { error } = await ctx.sb.from('settings').update(build(k => String(f.get(k) ?? ''))).eq('id', 1)
    setBusy(false); ctx.say(error ? error.message : 'Settings saved'); ctx.load()
  }}>
    <div className="stg-body">{children}</div>
    <div className="stg-foot"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </form>
}

export default function SettingsPage({ ctx, mfaRequired }: { ctx: any; mfaRequired: boolean }) {
  const st = ctx.st
  const [tab, setTab] = useState<TabId>('profile')
  const list = useRef<HTMLDivElement>(null)

  function onKey(e: React.KeyboardEvent) {
    const i = TABS.findIndex(t => t.id === tab)
    const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (to < 0) return
    e.preventDefault(); setTab(TABS[to].id); (list.current?.querySelectorAll<HTMLElement>('[role=tab]')[to])?.focus()
  }

  const loading = <p className="mut" style={{ margin: 0 }}>Loading settings…</p>
  const panel = (id: TabId, body: React.ReactNode) => {
    const t = TABS.find(x => x.id === id)!
    return <section key={id} className="stg-panel" role="tabpanel" id={'stg-p-' + id} aria-labelledby={'stg-t-' + id} hidden={tab !== id}>
      <header className="stg-head"><h2>{t.title}</h2><p>{t.sub}</p></header>{body}</section>
  }

  return <div className="stg">
    <div className="stg-nav" role="tablist" aria-label="Settings topics" aria-orientation="vertical" ref={list} onKeyDown={onKey}>
      {TABS.map(t => <button key={t.id} type="button" role="tab" id={'stg-t-' + t.id} aria-selected={tab === t.id} aria-controls={'stg-p-' + t.id} tabIndex={tab === t.id ? 0 : -1} className="stg-tab" onClick={() => setTab(t.id)}><Ic n={t.icon} s={19} /><span>{t.label}</span></button>)}
    </div>
    <div className="stg-main">
      {panel('profile', st ? <SaveForm ctx={ctx} build={g => ({ shop_name: g('sn').trim() || 'Swaasa Wedding Rentals', shop_phone: g('sp').trim(), shop_address: g('sa').trim() })}>
        <div className="stg-prof">
          <div className="stg-brand"><img src="/logo-mark.png" alt="" width={96} height={94} /><b>{st.shop_name || 'Swaasa Wedding Rentals'}</b></div>
          <div className="stg-grid">
            <Txt name="sn" label="Shop name" def={st.shop_name || 'Swaasa Wedding Rentals'} span />
            <Txt name="sp" label="Shop phone" def={st.shop_phone || ''} type="tel" inputMode="tel" />
            <Txt name="sa" label="Shop address" def={st.shop_address || ''} span />
          </div>
        </div>
      </SaveForm> : loading)}

      {panel('staff', <div className="stg-body"><StaffAdmin ctx={ctx} /></div>)}

      {panel('pricing', st ? <SaveForm ctx={ctx} build={g => ({ advance_pct: +g('a'), advance_min: +g('m'), late_grace_days: +g('lg') || 0 })}>
        <Group title="Refundable deposit" sub="The deposit is the higher of the percentage and the minimum amount.">
          <div className="stg-grid">
            <Num name="a" label="Refundable deposit (% of rent)" min={0} max={100} def={st.advance_pct} unit="%" />
            <Num name="m" label="Minimum refundable deposit" min={0} def={st.advance_min ?? 1000} prefix="₹" />
          </div>
        </Group>
        <Group title="Late returns">
          <div className="stg-grid">
            <Num name="lg" label="Free days after the return date before a late fee starts" min={0} max={14} def={st.late_grace_days ?? 0} unit="days" />
          </div>
        </Group>
      </SaveForm> : loading)}

      {panel('policies', st ? <SaveForm ctx={ctx} build={g => ({ buffer_days: +g('b'), agreement_terms: g('at').trim() })}>
        <Group title="Between rentals">
          <div className="stg-grid">
            <Num name="b" label="Cleaning and preparation days after each return" min={0} max={7} def={st.buffer_days} unit="days" hint="A changed cleaning period applies to new bookings. Bookings already made keep the gap they were made with." />
          </div>
        </Group>
        <Group title="Receipt and rental agreement" sub="These terms are a starting template. Please read them and change them to match your shop’s own policy before giving them to customers.">
          <label className="stg-f"><span className="stg-l">Terms printed on the receipt</span><textarea name="at" rows={10} defaultValue={st.agreement_terms || ''} /></label>
        </Group>
      </SaveForm> : loading)}

      {panel('alterations', st ? <SaveForm ctx={ctx} build={g => ({ measure_by_days: +g('mb'), send_by_days: +g('sd'), tailor_days: +g('td') })}>
        <Group title="Checkpoints (days before delivery)" sub="A warning appears on the bell and the Today list when one of these dates passes and the step is still not done.">
          <div className="stg-grid">
            <Num name="mb" label="Measurements must be taken by" min={1} max={30} def={st.measure_by_days ?? 5} unit="days" />
            <Num name="sd" label="Dress must be with the tailor by" min={1} max={30} def={st.send_by_days ?? 4} unit="days" />
            <Num name="td" label="Usual tailor turnaround" min={1} max={21} def={st.tailor_days ?? 3} unit="days" hint="Used for the warning when a booking is taken with too little time." />
          </div>
        </Group>
      </SaveForm> : loading)}

      {panel('notifications', st ? <SaveForm ctx={ctx} build={g => ({ alert_horizon_days: +g('ah'), clean_lead_days: +g('cl'), alert_idle_days: +g('ai'), alt_soon_days: +g('as') })}>
        <Group title="Alert timing (days)" sub="A warning appears on the bell and the Today list when one of these dates passes and the step is still not done.">
          <div className="stg-grid">
            <Num name="ah" label="Look ahead for preparation problems" min={1} max={30} def={st.alert_horizon_days ?? 7} unit="days" />
            <Num name="cl" label="Time a dress in To Be Sent needs before delivery" min={1} max={14} def={st.clean_lead_days ?? 3} unit="days" />
            <Num name="ai" label="Warn about an item waiting to be sent after" min={1} max={30} def={st.alert_idle_days ?? 3} unit="days" />
            <Num name="as" label="“Alteration due soon” window" min={1} max={14} def={st.alt_soon_days ?? 2} unit="days" />
          </div>
        </Group>
      </SaveForm> : loading)}

      {panel('security', <div className="stg-body"><MfaSetup sb={ctx.sb} required={mfaRequired} /></div>)}

      {panel('faqs', <div className="stg-body"><FaqSettings ctx={ctx} /></div>)}

      {panel('images', <div className="stg-body"><HomeImagesSettings ctx={ctx} /></div>)}

      {panel('stories', <div className="stg-body"><CustomerStoriesSettings ctx={ctx} /></div>)}
    </div>
  </div>
}
