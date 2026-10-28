// Suggests dominant colours from a dress photo. These are SUGGESTIONS ONLY: a person must confirm them before saving.
const FAM = ['Red', 'Pink', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple']
export function classify(h: number, s: number, l: number): string {
  if (l < 0.14) return 'Black'
  if (l > 0.88 && s < 0.25) return 'White'
  if (s < 0.12) return l > 0.45 ? 'Silver' : 'Black'
  if (s < 0.3 && l > 0.7 && h >= 25 && h <= 60) return 'Beige / Cream'
  if (h < 12 || h >= 345) return l < 0.28 ? 'Maroon' : l > 0.72 ? 'Pink' : 'Red'
  if (h < 22) return l < 0.32 ? 'Brown' : s > 0.6 && l > 0.45 ? 'Orange' : 'Brown'
  if (h < 38) return l < 0.35 ? 'Brown' : s > 0.7 && l > 0.45 ? 'Orange' : l > 0.72 ? 'Beige / Cream' : 'Brown'
  if (h < 52) return s > 0.45 && l > 0.35 && l < 0.7 ? 'Gold' : s > 0.7 && l >= 0.7 ? 'Yellow' : l > 0.7 ? 'Beige / Cream' : 'Brown'
  if (h < 70) return l > 0.5 ? 'Yellow' : 'Green'
  if (h < 170) return 'Green'
  if (h < 255) return 'Blue'
  if (h < 300) return 'Purple'
  return l < 0.3 ? 'Maroon' : 'Pink'
}
const hsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
// Pure function so it can be tested: pixels is RGBA data of the downsized photo.
export function suggestFromPixels(px: Uint8ClampedArray | number[], w: number, h: number): string[] {
  const at = (x: number, y: number) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]] }
  // Background colour = median of the outer frame, so a plain studio wall is ignored.
  const edge: number[][] = []; const m = Math.max(1, Math.round(w * 0.06))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < m || x >= w - m || y < m || y >= h - m) edge.push(at(x, y))
  const med = (k: number) => { const v = edge.map(p => p[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] }
  const bg = [med(0), med(1), med(2)]
  const votes: Record<string, number> = {}; let total = 0
  for (let y = Math.round(h * 0.12); y < Math.round(h * 0.92); y++) for (let x = Math.round(w * 0.2); x < Math.round(w * 0.8); x++) {
    const [r, g, b] = at(x, y)
    if (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 38) continue                      // background
    const [H, S, L] = hsl(r, g, b)
    if (H >= 8 && H <= 32 && S >= 0.22 && S <= 0.6 && L >= 0.38 && L <= 0.78) continue  // skin tones
    const c = classify(H, S, L); votes[c] = (votes[c] || 0) + 1; total++
  }
  if (total < 40) return []
  const share = Object.entries(votes).map(([k, v]) => [k, v / total] as [string, number]).sort((a, b) => b[1] - a[1])
  const out = share.filter(([, v]) => v >= 0.15).slice(0, 3).map(([k]) => k)
  if (share.filter(([k, v]) => FAM.includes(k) && v >= 0.12).length >= 3 && !out.includes('Floral / Multicolour')) out.unshift('Floral / Multicolour')
  return out
}
export async function suggestColours(src: string | File): Promise<string[]> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src)
  const img = new Image(); if (typeof src === 'string') img.crossOrigin = 'anonymous'
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url })
  const W = 72, H = Math.max(8, Math.round(72 * img.height / img.width))
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, W, H)
  return suggestFromPixels(ctx.getImageData(0, 0, W, H).data, W, H)
}

// ---- Colours worked out from words ------------------------------------------------------------------------------------
// Looks at what staff typed (the colour box, the dress name, the description) before it ever looks at the photo.
export const COLOUR_WORDS: Record<string, string[]> = {
  'Black': ['black', 'ebony', 'charcoal'], 'White': ['white', 'snow white'],
  'Blue': ['blue', 'navy', 'teal', 'turquoise', 'cobalt', 'sapphire', 'indigo', 'sky', 'aqua', 'peacock'],
  'Green': ['green', 'emerald', 'olive', 'mint', 'sage', 'moss', 'pista'], 'Yellow': ['yellow', 'mustard', 'lemon', 'haldi', 'turmeric'],
  'Red': ['red', 'crimson', 'scarlet', 'ruby', 'cherry'], 'Brown': ['brown', 'chocolate', 'coffee', 'tan', 'copper', 'bronze', 'mocha'],
  'Orange': ['orange', 'rust', 'coral', 'peach', 'saffron', 'tangerine'], 'Pink': ['pink', 'blush', 'rose', 'magenta', 'fuchsia', 'rani', 'salmon'],
  'Gold': ['gold', 'golden', 'zari'], 'Silver': ['silver', 'grey', 'gray', 'steel'],
  'Purple': ['purple', 'violet', 'lavender', 'lilac', 'mauve', 'plum', 'orchid'], 'Beige / Cream': ['beige', 'cream', 'ivory', 'champagne', 'nude', 'ecru', 'sand'],
  'Maroon': ['maroon', 'burgundy', 'wine', 'mehroon', 'claret'], 'Floral / Multicolour': ['floral', 'flower', 'flowers', 'multicolour', 'multicolor', 'multi-colour', 'multi colour', 'rainbow'],
}
const WORD_RX = Object.entries(COLOUR_WORDS).map(([label, ws]) => [label, new RegExp('\\b(' + ws.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b')] as [string, RegExp])
export function colourWords(text: string): string[] {
  const t = (text || '').toLowerCase().replace(/off[\s-]?white/g, ' cream ')
  return WORD_RX.map(([label, rx]) => [label, t.search(rx)] as [string, number]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([l]) => l)
}
// Words first. Only if the words give no colour is the photo examined.
export async function autoColours(text: string, photo?: string | File | null): Promise<{ tags: string[]; source: 'words' | 'photo' | 'none' }> {
  const w = colourWords(text); if (w.length) return { tags: w.slice(0, 3), source: 'words' }
  if (photo) { try { const s = await suggestColours(photo); if (s.length) return { tags: s, source: 'photo' } } catch { /* unreadable photo */ } }
  return { tags: [], source: 'none' }
}
