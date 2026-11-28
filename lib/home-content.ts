// Fallback homepage category cards. Live values are owner-managed in Supabase; keep these defaults
// in sync with the seed rows in migration-v36-homepage-category-images.sql.
export type LookTile = { title: string; note: string; img: string; alt: string }

export const LOOK_TILES: LookTile[] = [
  { title: 'Bridal Lehengas', note: 'For the ceremony', img: '/category-images/bridal-lehengas.png', alt: 'Model wearing a ruby red and antique gold bridal lehenga' },
  { title: 'Reception Looks', note: 'Soft and graceful', img: '/category-images/reception-looks.png', alt: 'Model wearing a pearl champagne and blush embroidered reception lehenga' },
  { title: 'Sangeet & Mehendi', note: 'Colour for the celebrations', img: '/category-images/sangeet-mehendi.png', alt: 'Model wearing a colourful emerald and fuchsia dance lehenga' },
  { title: 'Bridesmaids', note: 'For the people by your side', img: '/category-images/bridesmaids.png', alt: 'Two models in forest green and navy embroidered lehenga sets' },
  { title: 'Other occasions', note: 'Find a look for what is ahead', img: '/category-images/other-occasions.png', alt: 'Model wearing a mustard gold festive silk saree' },
]

export const HERO_IMAGE = { src: '/home-hero-luxury.jpg', alt: 'Bride wearing an embroidered wine-red lehenga in a bridal boutique' }
export const STUDIO_IMAGE = { src: '/reels/reel-5-poster.webp', alt: 'A customer looking through lehengas at the Swaasa studio' }
export const STUDIO_STEPS = ['We call you', 'Fix a time', 'Try a few looks']
