# Reels: better quality version (replaces the earlier swaasa-fix-media.zip)

The earlier small version (360 x 640 at 24 frames/second) looked soft, and fine detail on the dresses (sequins, embroidery) was lost.
This version goes back to the original picture size and smoothness, and compresses more cleverly instead.

- public/reels/reel-1.mp4 to reel-8.mp4: H.264, 540 x 960 (same as the originals), 30 frames/second (same as the originals),
  about 520 kbps video. Audio is kept, full length, stereo AAC 56 kbps. "faststart" lets playback begin before the file has fully downloaded.
- Total 43.4 MB -> 26.2 MB (about 40% smaller):
  reel-1 7.0 -> 4.5 MB, reel-2 5.4 -> 3.3, reel-3 7.3 -> 4.5, reel-4 3.7 -> 2.3, reel-5 3.8 -> 2.4, reel-6 3.7 -> 2.3, reel-7 7.2 -> 4.4, reel-8 3.9 -> 2.4
- public/reels/reel-N-poster.webp: WebP posters at up to 540 px wide (a little sharper than the earlier 480 px ones).
- lib/reels.ts: poster names point to the .webp files (same as before).

Upload everything in this zip over the site. If you already uploaded the earlier media zip, these files simply replace it.
The list of unused files to delete (old .JPG posters, reel-N.jpg, hero.mp4, components/Hero.tsx) is the same as in the earlier README.

Trade-off, if you ever want to dial it: smaller files mean softer pictures. The first version I made (480 x 854, 20.5 MB total) sat between the two.
Trimming each reel to 20 to 25 seconds would cut the size without touching the quality; not done, since it changes what viewers see.
