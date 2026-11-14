// "Swaasa in Motion" on the booking page (collection). It is only shown there, never on a dress page or in the booking flow.
// The six thumbnails in /public/reels are stills cut from the brand film (public/hero.mp4), so the section works from day one.
// To show real Instagram Reels: put a vertical picture in /public/reels (about 360 x 640) and, if you like, a short silent clip,
// then change the list below. `href` is the reel's own Instagram address; without it the card opens the profile.
export const INSTAGRAM_URL = process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/swaasa_rentals/'
export type Reel = { poster: string; alt: string; video?: string; href?: string }
export const REELS: Reel[] = [
  { poster: '/reels/reel-1.jpg', alt: 'Bride in an ivory gown and veil' },
  { poster: '/reels/reel-2.jpg', alt: 'Red and gold bridal embroidery, close up' },
  { poster: '/reels/reel-3.jpg', alt: 'Bride in a purple and gold bridal saree' },
  { poster: '/reels/reel-4.jpg', alt: 'Gold embroidered lehenga skirt' },
  { poster: '/reels/reel-5.jpg', alt: 'Champagne gown moving in the light' },
  { poster: '/reels/reel-6.jpg', alt: 'Bride in a lace ball gown' },
]
