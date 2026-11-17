# Audit items M6 (public error page) and M7 (contrast and small text)

No database change. Nothing to run in Supabase.

## M6. Public error page now written for customers
- app/error.tsx: new wording ("Sorry, something went wrong"), buttons "Try again" and "Back to home page" (goes to /, no longer to the admin login),
  and a line "Need help with a booking? Call us on <number>" (tap to call). The old "tell the owner what you were doing" is gone.
  If no phone number is set, the line becomes "Message us on Instagram".
- app/global-error.tsx (the last-resort page, used if the whole page frame fails): same wording, home link and phone line.
- next.config.js: one new line that hands the existing STORE_PHONE setting to the browser build, because error pages run in the browser.
  No new setting is needed on Vercel. The number is already public on the home page. It is read when the site is built, so after changing
  STORE_PHONE on Vercel, redeploy for the error page to pick it up.
- The staff screens keep their own error page (app/admin/error.tsx, unchanged), which still talks to staff.

## M7. Contrast and small text (app/globals.css)
- Muted text colour --mut: #857866 -> #6b5f4e (was 4.0:1 on the page background, now 5.8:1).
- Gold --gold: #a8844a -> #7a5c2a (was 3.2:1, now 5.8:1). Both are at least 4.5:1 on the page, white cards and the pale rose chips.
  The dark-mode colours were already above 4.5:1 and are unchanged.
- Every font size below 12px is now 12px: 181 declarations (sizes 8 to 11.5px). Nothing else in the file changed.
- The gold and muted text will look a little darker and richer than before; that is the point.

## Please check on a phone and on a desktop after it deploys
Raising tiny text to 12px can make tight spots wrap or crowd. Worth a quick look at: the sidebar section headings and badges,
the notification bell and panel cards, calendar chips, Customers stat chips, Reports & Analytics bars, and the small labels above
the reels on the home page. If anything looks cramped, tell me which screen and I will adjust that one place.

## Safety net
tests/contrast-and-error.test.ts (new) fails if --mut or --gold ever drop below 4.5:1, if any text goes below 12px again,
or if the public error pages get staff wording or an /admin link again. Run with the other tests (npm test).
I could not run the tests or a build here (no internet to install packages), so they have not been run.
