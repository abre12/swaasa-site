import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supaAdmin, supaServer } from '@/lib/supabase/server'
export const maxDuration = 60
const FASHN = 'https://api.fashn.ai/v1'
const fail = (error: string, status: number) => NextResponse.json({ error }, { status })
export async function POST(req: Request) {
  const key = process.env.FASHN_API_KEY
  if (!key) return fail('Virtual try-on is not switched on yet.', 503)
  const fd = await req.formData()
  if (fd.get('consent') !== 'yes') return fail('Please accept the photo consent first.', 400)
  const file = fd.get('selfie') as File | null, dressId = String(fd.get('dressId') || '')
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 6_000_000) return fail('Please upload a JPG, PNG or WebP photo under 6 MB.', 400)

  // Daily limit per visitor (counts every attempt, since each one costs money).
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const ipHash = createHash('sha256').update(ip + (process.env.TRYON_SALT || '')).digest('hex')
  const admin = supaAdmin()
  const { data: st } = await admin.from('settings').select('tryon_daily_limit').single()
  const since = new Date(Date.now() - 864e5).toISOString()
  const { count } = await admin.from('tryon_log').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since)
  if ((count || 0) >= (st?.tryon_daily_limit ?? 3)) return fail('You have reached today’s try-on limit. Please visit us in store or try again tomorrow.', 429)

  const { data: dress } = await supaServer().from('dresses').select('images,try_on_image').eq('id', dressId).maybeSingle()
  const garment = dress?.try_on_image || dress?.images?.[0]
  if (!garment) return fail('Try-on is not available for this dress.', 422)
  await admin.from('tryon_log').insert({ ip_hash: ipHash })

  // The customer's photo is sent as base64 and never stored by us.
  const selfie = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
  const run = await fetch(`${FASHN}/run`, { method: 'POST', headers, body: JSON.stringify({ model_name: 'tryon-v1.6', inputs: { model_image: selfie, garment_image: garment } }) })
  const job = await run.json().catch(() => ({}))
  if (!run.ok || !job.id) return fail('The try-on service could not start. Please try again.', 502)

  for (let i = 0; i < 25; i++) {            // poll up to about 50 seconds
    await new Promise(r => setTimeout(r, 2000))
    const s = await (await fetch(`${FASHN}/status/${job.id}`, { headers })).json().catch(() => ({}))
    if (s.status === 'completed' && s.output?.[0]) {
      const img = await fetch(s.output[0]); const buf = Buffer.from(await img.arrayBuffer())
      return NextResponse.json({ image: `data:image/png;base64,${buf.toString('base64')}` })
    }
    if (s.status === 'failed') return fail('We could not fit the dress on that photo. Try a clear, front-facing, full-length photo.', 422)
  }
  return fail('That took too long. Please try again.', 504)
}
