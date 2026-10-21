import { NextResponse } from 'next/server'
import { supaServer } from '@/lib/supabase/server'
const ERR: Record<string, string> = { DATES_TAKEN: 'Sorry, those dates were just taken. Please choose other dates.', GAP_CLASH: 'Check dates for Cleaning & Preparation Period. Each dress needs a day for cleaning between rentals, so please choose dates that start a little later or end a little earlier.', NOT_AVAILABLE: 'This dress is not available for booking.', BAD_DATES: 'Please choose valid dates.', BAD_CONTACT: 'Please enter your name and a valid mobile number.' }
export async function POST(req: Request) {
  const b = await req.json()
  // The database re-checks availability atomically inside create_booking; the exclusion constraint makes double booking impossible.
  const { data, error } = await supaServer().rpc('create_booking', { p_dress: b.dress, p_start: b.start, p_end: b.end, p_name: b.name, p_phone: b.phone, p_email: b.email || null, p_notes: b.notes || null })
  if (error) { const k = Object.keys(ERR).find(k => error.message.includes(k)); return NextResponse.json({ error: k ? ERR[k] : 'Something went wrong. Please try again.' }, { status: k ? 409 : 500 }) }
  return NextResponse.json({ id: data })
}
