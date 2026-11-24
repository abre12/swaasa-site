import { NextRequest, NextResponse } from 'next/server'
import { supaServer } from '@/lib/supabase/server'
import { sendTelegram } from '@/lib/telegram'
import { dmy, inr } from '@/lib/util'
export const dynamic = 'force-dynamic'

// N-10: records the end-of-day close (the database checks who is calling and works out what it can) and tells the owner on Telegram.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin'); if (origin && new URL(origin).host !== req.headers.get('host')) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const sb = await supaServer(); const { data: { user } } = await sb.auth.getUser(); if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  let body: any; try { body = await req.json() } catch { return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 }) }
  const { data, error } = await sb.rpc('close_day', { p_day: String(body.day || ''), p_tomorrow_not_ready: Math.max(0, Math.round(+body.notReady || 0)), p_tomorrow_checked: !!body.checked, p_overdue_called: Math.max(0, Math.round(+body.called || 0)), p_note: body.note ? String(body.note).slice(0, 500) : null })
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes('FORBIDDEN') ? 403 : 400 })
  const r: any = data
  const flags = [!r.cash_tallied ? 'cash NOT tallied' : r.cash_difference ? `cash difference ${inr(r.cash_difference)}` : '', r.tomorrow_not_ready ? `${r.tomorrow_not_ready} of tomorrow's dresses not ready` : '', r.overdue_returns > r.overdue_called ? `${r.overdue_returns - r.overdue_called} overdue returns not called` : ''].filter(Boolean)
  const text = [`${flags.length ? '⚠️' : '✅'} Day closed · ${dmy(r.day)} · by ${r.closed_by_name}`,
    `Cash: ${r.cash_tallied ? (r.cash_difference ? `tallied, difference ${inr(r.cash_difference)}` : 'tallied, no difference') : 'NOT tallied'}`,
    `Tomorrow: ${r.tomorrow_deliveries} ${r.tomorrow_deliveries === 1 ? 'delivery' : 'deliveries'}${r.tomorrow_deliveries ? `, ${r.tomorrow_not_ready} not ready${r.tomorrow_checked ? ' (checked by staff)' : ' (not checked)'}` : ''}`,
    `Overdue returns: ${r.overdue_returns}${r.overdue_returns ? `, ${r.overdue_called} called` : ''}`, r.note ? `Note: ${r.note}` : '', flags.length ? `Needs your attention: ${flags.join('; ')}` : ''].filter(Boolean).join('\n')
  let sent = false
  try { const chat = process.env.TELEGRAM_OWNER_CHAT_ID; if (chat && process.env.TELEGRAM_BOT_TOKEN) { await sendTelegram(chat, text); sent = true } } catch { /* the close is saved either way */ }
  return NextResponse.json({ ok: true, row: r, sent })
}
