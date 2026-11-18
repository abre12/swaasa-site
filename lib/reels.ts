export const INSTAGRAM_URL = process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/swaasa_rentals/'

// Web-sized muted previews for the booking-page carousel. The small posters are served from this site (public/reels).
// The videos (about 26 MB in total) are served from NEXT_PUBLIC_REELS_VIDEO_BASE_URL when it is set, for example a public Supabase Storage bucket:
//   https://YOUR-PROJECT.supabase.co/storage/v1/object/public/reels
// When it is empty they come from public/reels as before. Moving them out of the repository is described in docs/MEDIA.md.
const VIDEO_BASE = (process.env.NEXT_PUBLIC_REELS_VIDEO_BASE_URL || '/reels').trim().replace(/\/+$/, '')
export type Reel = { poster: string; video: string; alt: string }
export const REELS: Reel[] = [
  { poster: '/reels/reel-1-poster.webp', video: `${VIDEO_BASE}/reel-1.mp4`, alt: 'Swaasa bridal look 1' },
  { poster: '/reels/reel-2-poster.webp', video: `${VIDEO_BASE}/reel-2.mp4`, alt: 'Swaasa bridal look 2' },
  { poster: '/reels/reel-3-poster.webp', video: `${VIDEO_BASE}/reel-3.mp4`, alt: 'Swaasa bridal look 3' },
  { poster: '/reels/reel-4-poster.webp', video: `${VIDEO_BASE}/reel-4.mp4`, alt: 'Swaasa bridal look 4' },
  { poster: '/reels/reel-5-poster.webp', video: `${VIDEO_BASE}/reel-5.mp4`, alt: 'Swaasa bridal look 5' },
  { poster: '/reels/reel-6-poster.webp', video: `${VIDEO_BASE}/reel-6.mp4`, alt: 'Swaasa bridal look 6' },
  { poster: '/reels/reel-7-poster.webp', video: `${VIDEO_BASE}/reel-7.mp4`, alt: 'Swaasa bridal look 7' },
  { poster: '/reels/reel-8-poster.webp', video: `${VIDEO_BASE}/reel-8.mp4`, alt: 'Swaasa bridal look 8' },
]
