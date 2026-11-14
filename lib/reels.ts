export const INSTAGRAM_URL = process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/swaasa_rentals/'

// Locally hosted, web-sized muted previews for the booking-page carousel.
export type Reel = { poster: string; video: string; alt: string }
export const REELS: Reel[] = [
  { poster: '/reels/reel-1-poster.webp', video: '/reels/reel-1.mp4', alt: 'Swaasa bridal look 1' },
  { poster: '/reels/reel-2-poster.JPG', video: '/reels/reel-2.mp4', alt: 'Swaasa bridal look 2' },
  { poster: '/reels/reel-3-poster.JPG', video: '/reels/reel-3.mp4', alt: 'Swaasa bridal look 3' },
  { poster: '/reels/reel-4-poster.JPG', video: '/reels/reel-4.mp4', alt: 'Swaasa bridal look 4' },
  { poster: '/reels/reel-5-poster.webp', video: '/reels/reel-5.mp4', alt: 'Swaasa bridal look 5' },
  { poster: '/reels/reel-6-poster.webp', video: '/reels/reel-6.mp4', alt: 'Swaasa bridal look 6' },
  { poster: '/reels/reel-7-poster.JPG', video: '/reels/reel-7.mp4', alt: 'Swaasa bridal look 7' },
  { poster: '/reels/reel-8-poster.JPG', video: '/reels/reel-8.mp4', alt: 'Swaasa bridal look 8' },
]
