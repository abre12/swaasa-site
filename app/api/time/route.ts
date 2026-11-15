import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
// OP-6: the server's clock, so the admin screens do not depend on the phone's date and time being right.
export async function GET() { return NextResponse.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } }) }
