import { FAQ } from '@/lib/seo-content'
import { supaServer } from '@/lib/supabase/server'

export type PublicFaq = { id: string; q: string; a: string }

/** Load owner-managed FAQ content, with the source FAQ list kept as a safe fallback until the migration is applied. */
export async function getPublicFaqs(): Promise<PublicFaq[]> {
  try {
    const sb = await supaServer()
    const { data, error } = await sb
      .from('site_faqs')
      .select('id, question, answer, sort_order')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return FAQ.map((f, i) => ({ id: `fallback-${i}`, q: f.q, a: f.a }))
    return (data ?? []).map(row => ({ id: row.id, q: row.question, a: row.answer }))
  } catch {
    return FAQ.map((f, i) => ({ id: `fallback-${i}`, q: f.q, a: f.a }))
  }
}
