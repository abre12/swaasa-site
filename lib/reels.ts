// "Swaasa in Motion" on the booking page (collection). It is only shown there, never on a dress page or in the booking flow.
//
// TO SHOW YOUR INSTAGRAM REELS (Instagram's own player):
//   1. On Instagram open the reel, tap the three dots, then "Copy link".
//   2. Paste the link as a new line in REEL_LINKS below. The first line shows first. Remove a line to remove that reel.
//   3. Upload this file to GitHub. Vercel rebuilds and the reels appear. Nothing else to do.
// The reel must be public (the Swaasa account cannot be private).
export const REEL_LINKS: string[] = [
  'https://www.instagram.com/p/DKYupVJOQrh/',
  'https://www.instagram.com/p/DF5MGmoSBKE/',
  'https://www.instagram.com/reel/DbphFNbTtv-/',
  'https://www.instagram.com/reel/Da76-JORemi/',
'https://www.instagram.com/reel/DW87NM2EeZr/',
'https://www.instagram.com/reel/DNnxOYzSrrs/',
'https://www.instagram.com/reel/DMmSQcYR9k8/',
'https://www.instagram.com/reel/DHTQk4uSjb_/',
'https://www.instagram.com/reel/DGgKkDqtO89/',


]

export const INSTAGRAM_URL = process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/swaasa_rentals/'

// Shown only while REEL_LINKS is empty: stills cut from the brand film (public/reels), each opening the Instagram profile.
export type Reel = { poster: string; alt: string; video?: string; href?: string }
export const REELS: Reel[] = [
  { poster: '/reels/reel-1.jpg', alt: 'Bride in an ivory gown and veil' },
  { poster: '/reels/reel-2.jpg', alt: 'Red and gold bridal embroidery, close up' },
  { poster: '/reels/reel-3.jpg', alt: 'Bride in a purple and gold bridal saree' },
  { poster: '/reels/reel-4.jpg', alt: 'Gold embroidered lehenga skirt' },
  { poster: '/reels/reel-5.jpg', alt: 'Champagne gown moving in the light' },
  { poster: '/reels/reel-6.jpg', alt: 'Bride in a lace ball gown' },
]
