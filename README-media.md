# Audit item M3: heavy media (swaasa-fix-media)

No database change. No code change except lib/reels.ts (poster file names).

## What changed
- public/reels/reel-1.mp4 to reel-8.mp4 re-encoded: H.264, 360x640 (was 540x960), 24 frames/second, about 240 kbps video,
  and the AUDIO IS KEPT (AAC, mono, 40 kbps, full length; clear for speech). "faststart" lets playback begin before the whole file downloads.
  Same length as before; the sound button still works. Total 43.4 MB -> 11.2 MB:
  reel-1 7.0 -> 1.9 MB, reel-2 5.4 -> 1.5, reel-3 7.3 -> 2.0, reel-4 3.7 -> 1.0, reel-5 3.8 -> 1.0, reel-6 3.7 -> 1.0, reel-7 7.2 -> 1.9, reel-8 3.9 -> 1.0
- public/reels/reel-N-poster.webp: all eight posters are now WebP at 480 px wide (560 KB -> 310 KB in total; reel-7's went 111 KB -> 39 KB).
- lib/reels.ts: the five posters that were .JPG now point to .webp.

## Upload
Upload the contents of this zip over the site (public/reels/ and lib/reels.ts).

## Delete from GitHub (these are not used by any page)
- public/reels/reel-2-poster.JPG, reel-3-poster.JPG, reel-4-poster.JPG, reel-7-poster.JPG, reel-8-poster.JPG (replaced by .webp)
- public/reels/reel-1.jpg to reel-6.jpg (old thumbnails, not referenced anywhere)
- public/hero.mp4 (4.7 MB) and components/Hero.tsx (nothing imports it; the login page uses a still image)

Deleting these also takes about 5 MB more out of the repository. Do the upload first, check the site, then delete.

## Not done
- Trimming each reel to 20 to 25 seconds would bring the longest ones to about 1 MB as well; not done, since it changes what viewers see.
- Hosting the videos outside the repository (Vercel Blob or similar) needs an account decision, so it was left alone.
