'use client'
import { Ic } from './icons'
// Month selector shown as "Nov 2026" with a calendar icon and chevron. A transparent native month input sits on top so the browser's own picker opens on click.
export default function MonthPick({ value, onChange, max, title, compact }: { value: string; onChange: (v: string) => void; max?: string; title?: string; compact?: boolean }) {
  const label = value ? new Date(value + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'All months'
  return <label className={'mpick' + (compact ? ' sm' : '')} title={title}><Ic n="calendar" s={compact ? 18 : 22} /><span>{label}</span><Ic n="down" s={compact ? 16 : 20} />
    <input type="month" className="mp-in" value={value} max={max} aria-label="Month" onChange={e => onChange(e.target.value)} onClick={e => (e.currentTarget as any).showPicker?.()} /></label>
}
