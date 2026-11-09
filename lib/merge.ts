// Merge freshly fetched rows into the list already on screen, by id.
// Returns the SAME array when nothing changed, so React does not re-render and
// downstream useMemo / alert calculations are not re-run on every poll.
export function mergeRows<T extends { id: any }>(prev: T[], incoming: T[], cmp?: (a: T, b: T) => number): T[] {
  if (!incoming.length) return prev
  const map = new Map<any, T>(prev.map(r => [r.id, r]))
  let changed = false
  for (const row of incoming) {
    const old = map.get(row.id)
    if (!old || JSON.stringify(old) !== JSON.stringify(row)) { map.set(row.id, row); changed = true }
  }
  if (!changed) return prev
  const next = Array.from(map.values())
  return cmp ? next.sort(cmp) : next
}

// Newest first by a date/time field, id as a stable tie-break (matches the server ordering).
export const byDesc = (field: string) => (a: any, b: any) =>
  String(b[field] ?? '').localeCompare(String(a[field] ?? '')) || String(a.id).localeCompare(String(b.id))
