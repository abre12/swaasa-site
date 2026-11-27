// The pictures and short labels on the customer home page. Change a photo or a word here and the page follows; nothing else needs editing.
// The photos are the ones already in /public (the reel posters and the hero still). Add a new image file to /public and point to it below.
export type LookTile = { title: string; note: string; img: string; alt: string }

export const LOOK_TILES: LookTile[] = [
  { title: 'Bridal lehengas', note: 'For the ceremony', img: '/reels/reel-3-poster.webp', alt: 'A bride in a red and gold bridal lehenga with a red veil' },
  { title: 'Reception looks', note: 'Soft and graceful', img: '/reels/reel-4-poster.webp', alt: 'A woman in a pale pink and silver embroidered lehenga' },
  { title: 'Sangeet & mehendi', note: 'Colour for the celebrations', img: '/reels/reel-2-poster.webp', alt: 'A smiling woman in a pink floral lehenga in the studio' },
  { title: 'Bridesmaids', note: 'For the people by your side', img: '/reels/reel-7-poster.webp', alt: 'Two women in a green and a navy lehenga set' },
  { title: 'Other occasions', note: 'Find a look for what is ahead', img: '/reels/reel-8-poster.webp', alt: 'Close-up of an orange embroidered outfit with traditional jewellery' },
]

export const HERO_IMAGE = { src: '/collection-hero.jpg', alt: 'A bride in an ivory gown and long veil, turning' }
export const STUDIO_IMAGE = { src: '/reels/reel-5-poster.webp', alt: 'A customer looking through lehengas at the Swaasa studio' }
export const STUDIO_STEPS = ['We call you', 'Fix a time', 'Try a few looks']
