# Google reviews carousel (customer home page)

Sits inside the "Wedding looks to rent" card, directly above **VISIT OUR STUDIO**. It shows only **5-star reviews of 11 words or more** and hides itself if there are none (or if Google is not configured).

## Files
- `lib/reviews.ts` (new): fetches and filters the reviews on the server, cached 24 hours.
- `components/ReviewsCarousel.tsx` (new): the swipeable carousel (arrows, touch swipe, keyboard scroll, Read more).
- `app/page.tsx`, `app/globals.css`, `.env.example` (changed). `tests/reviews.test.ts` (new).

## One-time setup (about 10 minutes, free at this volume)
1. Google Cloud Console: create/choose a project, enable **Places API (New)**, and create an API key.
2. Restrict the key to **Places API (New)** only (API restrictions). It is used server-side only.
3. Find the **Place ID** of SWAASA Wedding Rentals with Google's "Place ID Finder" (starts with `ChIJ`). The `0x3b05...:0xd363...` value in the Maps link is NOT a Place ID.
4. In Vercel, add `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID` (Production), then redeploy.

## Good to know
- Google's Places API returns at most **5 reviews per place** (its "most relevant" set), so after filtering you may see 2 to 5 cards, and the set can change over time. To show every qualifying review, switch to the **Google Business Profile API** (owner login via OAuth), which returns all reviews; the filter in `pickReviews` stays the same.
- Reviewer names, photos and the "Google review" label are shown, and "See all reviews on Google" links to your listing, as Google's display terms require. Do not edit review text.
