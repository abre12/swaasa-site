# Swaasa redesign: Staff Login with hero film, and the new Booking (collection) page

No database change. No new packages. Upload the files in this zip over the same paths in the repo (GitHub web uploader), then delete `components/Hero.tsx` (no longer used).

## Files
| File | What changed |
| --- | --- |
| `app/login/page.tsx` | New Staff Login: full-screen hero film with a floating card, icons on the fields, show/hide password, "Forgot Password?" help. Sign-in and two-step code logic are unchanged. |
| `components/LoginVideo.tsx` (new) | The hero film. Muted, looping, play/pause button, respects "reduce motion". Plays 7.5s to 40.5s of `hero.mp4` so the opening logo card is skipped. |
| `app/collection/page.tsx` | New Booking page: header with Book Now, hero, feature strip, Browse by Category (with photos), colour filter, Swaasa in Motion, filters and dress grid. Filters, search, dates, sorting and colour logic are unchanged. |
| `components/ReelsCarousel.tsx` (new) | "Swaasa in Motion" Instagram Reels strip: arrows, dots, swipe. Only on this page, not on a dress page or in the booking flow. |
| `lib/reels.ts` (new) | The list of reels and the Instagram address. |
| `app/globals.css` | Old sign-in styles replaced; new login and booking-page styles added at the end. |
| `middleware.ts` | `login-poster.jpg` added to the files that are open before sign-in (the login page needs it). |
| `public/login-poster.jpg`, `public/collection-hero.jpg`, `public/reels/reel-1..6.jpg` (new) | Stills cut from your brand film. |
| `components/Hero.tsx` | **Delete.** Replaced by the new hero. |

## Things you may want to change
* **Reels.** The six thumbnails are stills from the brand film, so the section is not empty on day one. To use real Reels: add a vertical picture (about 360 x 640) to `public/reels/`, and optionally a short silent clip, then edit `lib/reels.ts`. Give each reel its own Instagram address in `href`, or it opens the profile. Instagram address: `NEXT_PUBLIC_INSTAGRAM_URL` in Vercel, otherwise https://www.instagram.com/swaasa_rentals/ (the one already in the footer).
* **Login film.** Replace `public/hero.mp4` (keep it under about 8 MB) and change `START` / `END` in `LoginVideo.tsx`.
* **Hero photo.** Replace `public/collection-hero.jpg` with a studio photo of a bride (wide, subject on the right).

## Decisions
* Categories on the cards are the site's real ones (Lehengas, Gowns, Sarees, Bridesmaid, Other Occasions), so the filters keep working. The reference image's "Reception Wear" and "Bridal Sets" do not exist in the dress data.
* The reference's heart icon (wishlist) is left out: there is no such feature. The person icon opens the staff dashboard; the magnifier jumps to the search box.
* Login uses the work email. The database login has no separate User ID.
* "Forgot Password?" explains that the owner resets it (Staff Admin > Reset password). There is no self-service reset email in the system.
* The dress page and booking flow are untouched, as in the reference ("not in the checkout").
* Fixed along the way: "Clear all filters" used to go to `/#collection`, which now redirects to the dashboard. It goes to `/collection#collection`.

## After uploading, check
1. Sign out, open `/login`: film plays, play/pause button works, wrong password shows the error, a correct one opens `/admin`. If two-step is on for you, the code step appears in the same card.
2. Open `/collection`: category cards filter, colour swatches filter, Apply works, reels arrows and dots move.
3. Phone: login card sits under the film; categories scroll sideways.
