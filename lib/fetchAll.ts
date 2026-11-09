// Supabase/PostgREST silently caps every response (1,000 rows by default). A plain
// `.select('*')` on a growing table therefore quietly returns an incomplete list once
// the table passes that size. fetchAll() pages through the whole result instead.
//
// `build` must return a FRESH query each call and should order by a unique column
// (add `.order('id')` as the last sort) so pages never overlap or skip rows.
// Keep `pageSize` at or below your project's "Max rows" API setting (default 1000).
export async function fetchAll<T = any>(build: () => any, pageSize = 1000): Promise<{ data: T[] | null; error: any }> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    const rows = (data as T[]) || []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return { data: out, error: null }
}
