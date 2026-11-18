# Large media (reels and the login film)

Videos are the heaviest thing in this project: `public/reels/reel-1.mp4` to `reel-8.mp4` are about 26 MB together and `public/hero.mp4`
(the film behind the staff sign-in) is 4.7 MB. Every re-encode of a video is stored again in git for ever, which is why the `.git` folder is
about 89 MB even though the current files are only ~31 MB. This page says how to keep videos out of git.

## 1. Serve the reel videos from Supabase Storage (no code change)

The site already supports this. `lib/reels.ts` reads `NEXT_PUBLIC_REELS_VIDEO_BASE_URL`; when it is set the eight videos load from there,
and when it is empty they load from `public/reels/` exactly as before. The small posters (`reel-N-poster.webp`, about 0.4 MB in total) stay in the repository.

1. Supabase > Storage > New bucket. Name it `reels` and tick **Public bucket**.
2. Upload the eight files with the same names: `reel-1.mp4` ... `reel-8.mp4`. Set the cache time to one year (31536000 seconds) when the upload screen offers it.
   If you ever re-encode a reel, upload it under a new name (for example `reel-3-v2.mp4`) and change that name in `lib/reels.ts`; this is what makes a one-year cache safe.
3. Open one file's public link in a browser and check it plays. The base address is that link without the file name, for example
   `https://YOUR-PROJECT.supabase.co/storage/v1/object/public/reels`
4. Vercel > Settings > Environment Variables: add `NEXT_PUBLIC_REELS_VIDEO_BASE_URL` with that address, for Production (and Preview if you want). Redeploy. `NEXT_PUBLIC_` values are
   baked in at build time, so a redeploy is required.
5. Open the customer home page, play a reel, and confirm in the browser's Network tab that the `.mp4` requests go to `supabase.co`.
6. Only after step 5 works, remove the videos from the repository: `git rm public/reels/*.mp4`, commit and push.
   Do not remove the `/reels/reel-N.mp4` pattern from `middleware.ts`; it is harmless and keeps the fallback working.

Cost check: the videos load only when a reel is near the front of the carousel, but every play comes out of your Supabase **egress** allowance.
Look at your plan's egress limit in Supabase > Settings > Billing before you rely on it for a busy season.

## 2. The login film (`public/hero.mp4`)

It is used by the staff sign-in page (`components/LoginVideo.tsx`) and is allowed through the login check in `middleware.ts`. It is small enough to stay in the repository.
To host it elsewhere, upload it to a public bucket and set `NEXT_PUBLIC_HERO_VIDEO` to its address; to change which seconds loop, edit `START` / `END` in `LoginVideo.tsx`.

## 3. Shrinking the existing git history (optional, one-off)

Removing files in a new commit does **not** make `.git` smaller; the old versions stay in history. Rewriting history changes every commit ID and needs a force-push, so only do it if the
clone size really bothers you (89 MB is well within what GitHub and Vercel handle). If you do:

1. Finish section 1 first, so nothing on the live site depends on the files.
2. Work on a **fresh clone**, not your working copy: `git clone git@github.com:YOU/REPO.git swaasa-clean && cd swaasa-clean`
3. `pip install git-filter-repo`, then: `git filter-repo --invert-paths --path-glob 'public/reels/*.mp4'`
4. Re-add the remote (filter-repo removes it) and run `git push --force --all`. Anyone else with a copy must re-clone.
5. Vercel redeploys from the new history. Check the live site afterwards.

Keep your own copy of the original videos (the originals are not recoverable from the rewritten repository).
