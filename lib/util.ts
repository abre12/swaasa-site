export const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN')
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addD = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
export const nDays = (s: string, e: string) => Math.round((+new Date(e) - +new Date(s)) / 864e5) + 1
export const CATS = ['Wedding gown', 'Lehenga', 'Bridal saree', 'Reception gown', 'Bridesmaid dress', 'Engagement outfit', 'Other occasion wear']
export const price = (d: any, s: string, e: string) => { const n = nDays(s, e), x = Math.max(0, n - d.included_days); return { n, extraDays: x, rent: d.price + x * d.extra_day_fee } }
