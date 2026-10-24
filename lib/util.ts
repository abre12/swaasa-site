export const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN')
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addD = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
export const nDays = (s: string, e: string) => Math.round((+new Date(e) - +new Date(s)) / 864e5) + 1
export const CATS = ['Wedding gown', 'Lehenga', 'Bridal saree', 'Reception gown', 'Bridesmaid dress', 'Engagement outfit', 'Other occasion wear']
export const price = (d: any, s: string, e: string) => { const n = nDays(s, e), x = Math.max(0, n - d.included_days); return { n, extraDays: x, rent: d.price + x * d.extra_day_fee } }

// ---- v2 additions -------------------------------------------------------------------------------------------------
// Business dates are Indian Standard Time, so "today" never flips at the wrong hour.
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export const istDate = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export const istTime = (ts: string) => new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
export const dmy = (s?: string | null) => s ? new Date(s.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–'
// The five customer-facing categories. Each groups one or more inventory categories.
export const MAIN_CATS = [
  { key: 'lehengas', label: 'LEHENGAS', subs: ['Lehenga'] },
  { key: 'gowns', label: 'GOWNS', subs: ['Wedding gown', 'Reception gown'] },
  { key: 'sarees', label: 'SAREES', subs: ['Bridal saree'] },
  { key: 'bridesmaid', label: 'BRIDESMAID', subs: ['Bridesmaid dress'] },
  { key: 'other', label: 'OTHER OCCASIONS', subs: ['Engagement outfit', 'Other occasion wear'] },
]
export const mainCatOf = (cat: string) => MAIN_CATS.find(m => m.subs.includes(cat))?.label || 'OTHER OCCASIONS'
export const COLOURS: { label: string; css: string }[] = [
  { label: 'Black', css: '#111111' }, { label: 'White', css: '#fbfbf8' }, { label: 'Blue', css: '#2a5fc4' }, { label: 'Green', css: '#2e9d5b' },
  { label: 'Yellow', css: '#f4d11e' }, { label: 'Red', css: '#d3202f' }, { label: 'Brown', css: '#7b4a2b' }, { label: 'Orange', css: '#f28a22' },
  { label: 'Pink', css: '#f5a6c3' }, { label: 'Gold', css: 'linear-gradient(135deg,#f6e3a0,#b98a34)' }, { label: 'Silver', css: 'linear-gradient(135deg,#f0f0f0,#9b9b9b)' },
  { label: 'Purple', css: '#7e3fa6' }, { label: 'Beige / Cream', css: '#e9dcc3' }, { label: 'Maroon', css: '#7a1428' },
  { label: 'Floral / Multicolour', css: 'conic-gradient(#e86a92,#f4c542,#4caf72,#4a7bd0,#9b59b6,#e86a92)' }, { label: 'Other', css: '#b9b2a6' },
]
export const PREP: Record<string, string> = { not_started: 'Not started', alterations_pending: 'Alterations pending', cleaning_pending: 'Cleaning pending', ready: 'Ready for delivery', delivered: 'Delivered' }
export const PAY_MODES = ['Cash', 'GPay / UPI', 'Card']
export const modeGroup = (m?: string | null) => /cash/i.test(m || '') ? 'Cash' : /upi|gpay|google/i.test(m || '') ? 'GPay / UPI' : /card/i.test(m || '') ? 'Card' : 'Other'
