import { LOOK_TILES, type LookTile } from '@/lib/home-content'
import { supaServer } from '@/lib/supabase/server'

export type HomepageLookTile = LookTile & { id: string }

export const DEFAULT_LOOK_CAPTION = 'Wedding lehengas, gowns, luxury salwars, sarees, Anarkalis, cape lehengas and shararas for weddings, sangeet, engagements and parties.'

/** Read the owner-managed line below the homepage category cards. */
export async function getHomepageLookCaption(): Promise<string> {
  try {
    const sb = await supaServer()
    const { data, error } = await sb
      .from('site_home_content')
      .select('look_caption')
      .eq('id', 1)
      .maybeSingle()

    if (error || typeof data?.look_caption !== 'string') return DEFAULT_LOOK_CAPTION
    return data.look_caption
  } catch {
    return DEFAULT_LOOK_CAPTION
  }
}

/** Read the owner-managed homepage category cards, preserving the bundled images until the migration is present. */
export async function getHomepageLookTiles(): Promise<HomepageLookTile[]> {
  try {
    const sb = await supaServer()
    const { data, error } = await sb
      .from('site_category_tiles')
      .select('id, title, note, alt_text, image_url, sort_order')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return LOOK_TILES.map((tile, i) => ({ ...tile, id: `fallback-${i}` }))
    return (data ?? []).map(row => ({
      id: row.id,
      title: row.title,
      note: row.note,
      alt: row.alt_text,
      img: row.image_url ?? '',
    }))
  } catch {
    return LOOK_TILES.map((tile, i) => ({ ...tile, id: `fallback-${i}` }))
  }
}
