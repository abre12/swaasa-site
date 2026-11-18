# Lead capture, local search and self-hosted fonts (18 Nov 2026)

No database change. Upload the files in this zip over the site, keeping the folders. Nothing needs deleting.

## 1. Contact: viewing request form and WhatsApp
- New section **Plan a private viewing** on the home page (between the service strip and the reviews): name, mobile, what they are looking for, event date, preferred visit day, a note. The top-right button now says **Request a viewing**.
- The request is sent to Telegram, to the owner chat and the staff chat (the same two chats the reminders use, so `TELEGRAM_BOT_TOKEN` and the two chat IDs must be set on Vercel). The message includes a WhatsApp link to the customer.
- **Message us on WhatsApp** buttons: one in the form section, one in the Visit our studio card. They use `STORE_PHONE`; if that is a landline, add `STORE_WHATSAPP` (the shop's WhatsApp mobile number) in Vercel. With no usable number the buttons are simply hidden; the form still works.
- Protection: the form refuses posts from other websites, ignores bots that fill a hidden field, limits each visitor to 4 requests an hour (40 an hour for the whole site), and sends one request per phone number every 10 minutes. These limits live in server memory, so they stop floods and repeat taps, not a determined attacker; a Cloudflare Turnstile check is the next step if spam ever appears.
- If Telegram is not set up or is down, the visitor sees "please call or WhatsApp us" rather than a false "sent".

Files: `components/ViewingRequest.tsx`, `app/api/viewing-request/route.ts`, `lib/viewing.ts`, `app/page.tsx`, `middleware.ts` (the form's address is open to the public, like the booking tracker), `app/globals.css`, `.env.example`.

## 2. Local search
- Map coordinates (8.481036937748145, 76.96942945344524) are now in the structured data, together with a map link. "Get directions" now opens the exact pin instead of searching the address.
- **Opening hours and price range are not published yet**, because they were not supplied. To add them, edit two lines in `lib/site.ts`:
  - `OPENING_HOURS`, for example `[{ days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], opens: '10:00', closes: '19:00' }]`
  - `PRICE_RANGE`, for example `'₹₹₹'`
  Once filled, the hours go into Google's data and are printed in the Visit card.

## 3. Fonts
- Cormorant Garamond, Inter and Playfair Display are now served from the site itself (`next/font`, `app/fonts.ts`) instead of a render-blocking stylesheet from Google. Same weights as before. Inter also includes the extended set so the rupee sign (₹) stays in Inter.
- The stylesheet now reads the fonts through variables (`--font-inter` and so on); the old font names are gone from it.
- The Next build downloads the fonts once, so the first build needs internet access (Vercel and GitHub both have it).

## 4. Found while doing this: the contrast fix had been undone
The "favicon fix" commit (e32565b, 17 Nov) put back the old `app/globals.css`, which silently removed the earlier contrast fix: the lighter grey and gold text colours, and 165 places with text under 12 px. The same rules are applied again here (checked: they reproduce the original fix exactly), and every contrast and font-size check in `tests/contrast-and-error.test.ts` is satisfied.
`--card:#fff` was also changed to `--card:#ffffff` (same colour). That test only reads six-digit colours, so with `#fff` it would have stopped with an error.

## Tests
New: `tests/viewing.test.ts` (form rules, the message, the route's protections), `tests/fonts.test.ts`. Updated: `tests/seo.test.ts` (map pin, hours, WhatsApp, form on the page). Not run on the build machine: this was written without internet, so the first CI run on GitHub is the real check.
