// Sends a message to a Telegram chat. Shared by the scheduled reminders and the end-of-day close. Long text is split into several messages.
export async function sendTelegram(chat: string, text: string) {
  const parts: string[] = []; let cur = ''
  for (const ln of text.split('\n')) { if ((cur + '\n' + ln).length > 3800) { parts.push(cur); cur = ln } else cur = cur ? cur + '\n' + ln : ln }
  if (cur) parts.push(cur)
  for (const p of parts) {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: p, disable_web_page_preview: true }) })
    if (!r.ok) throw new Error(`Telegram said ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
}
