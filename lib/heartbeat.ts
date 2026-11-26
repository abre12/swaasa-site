// A "heartbeat" is a ping sent to an outside monitoring service every time a scheduled job finishes. The service is set up to expect the ping
// on a schedule and emails or messages you if one does NOT arrive. That is how a job that silently stops (GitHub skipped it, the site was
// down, a secret expired) is noticed even when nothing in this app is running to complain about it.
//
// HEARTBEAT_URL is the address the service gave you. Put {slot} where the reminder's name should go if the service takes one address per check, e.g.
//   https://hc-ping.com/<your-project-ping-key>/swaasa-{slot}?create=1        (healthchecks.io: one check per reminder, made automatically)
// With no {slot} the same address is pinged for every reminder (a single "something ran" check).
export const heartbeatUrl = (slot: string, template = process.env.HEARTBEAT_URL): string | null => {
  const t = (template || '').trim()
  if (!/^https:\/\//i.test(t) || !/^[a-z0-9_-]{1,20}$/i.test(slot)) return null
  return t.split('{slot}').join(slot)
}

/** Never throws and never waits more than three seconds: a monitoring hiccup must not turn a sent reminder into a failure. */
export async function pingHeartbeat(slot: string, fetcher: typeof fetch = fetch, template = process.env.HEARTBEAT_URL): Promise<boolean> {
  const url = heartbeatUrl(slot, template); if (!url) return false
  try { return (await fetcher(url, { method: 'GET', signal: AbortSignal.timeout(3000), cache: 'no-store' })).ok } catch { return false }
}
