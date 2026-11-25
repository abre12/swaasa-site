import { createHmac } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { supaAdmin } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/apiGuard'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store, max-age=0' },
})

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: 'Not allowed.' }, 403)
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 2048) return reply({ error: 'Request is too large.' }, 413)

  let parsed: unknown
  try { parsed = await request.json() } catch { return reply({ error: 'Enter your booking ID and mobile number.' }, 400) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply({ error: 'Enter your booking ID and mobile number.' }, 400)
  const body = parsed as { bookingId?: unknown; phone?: unknown }

  const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim().toUpperCase() : ''
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : ''
  if (!/^[A-Z0-9-]{3,32}$/.test(bookingId) || phone.length < 10 || phone.length > 15) {
    return reply({ error: 'Enter a valid booking ID and mobile number.' }, 400)
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return reply({ error: 'Booking tracking is temporarily unavailable.' }, 503)

  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown'
  const ipHash = createHmac('sha256', serviceKey).update(ip).digest('hex')

  try {
    const { data, error } = await supaAdmin().rpc('customer_booking_track', {
      p_booking_id: bookingId,
      p_phone: phone,
      p_ip_hash: ipHash,
    })
    if (error) {
      console.error('Customer booking tracking lookup failed:', error.message)
      return reply({ error: 'Booking tracking is temporarily unavailable.' }, 503)
    }
    const row = data?.[0]
    if (!row) return reply({ error: 'No matching booking was found.' }, 404)
    if (!row.allowed) return reply({ error: 'Too many attempts. Please wait and try again.' }, 429)

    return reply({
      bookingId: row.booking_id,
      bookingStatus: row.booking_status,
      prepStatus: row.prep_status,
      startDate: row.start_date,
      endDate: row.end_date,
      eventDate: row.event_date,
      eventType: row.event_type,
    })
  } catch (error) {
    console.error('Customer booking tracking request failed:', error)
    return reply({ error: 'Booking tracking is temporarily unavailable.' }, 503)
  }
}
