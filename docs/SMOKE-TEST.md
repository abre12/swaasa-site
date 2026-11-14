# Smoke test: about 25 minutes, on the Preview (staging) link

Tick each line. Sign in as the **test owner** unless it says otherwise. Anything that does not behave as written: stop and do not release.
Reload the page before you start, and use the made-up sample data (`supabase/staging-sample-data.sql`).

## Sign-in and roles
- [ ] The owner signs in (two-step if switched on) and lands on the Dashboard with no error screen.
- [ ] A **preparation** login sees only the preparation pages, no bookings, no customer phone numbers.
- [ ] A login that is not in the staff list sees "This login does not have access", not a blank page.

## Bookings and customers
- [ ] New booking with phone `12345`: refused with a clear message. With `9810000009`: accepted.
- [ ] Type `9810000003` in a new booking: it says "This number is saved for: Chitra Test, Deepa Test". Tapping a name fills it in.
- [ ] Customers page: Chitra and Deepa are two separate customers, each showing "Same number as ...".
- [ ] New booking for ST-005 starting the day after SWSTAGE05 ends: as a manager it asks for the owner's approval (does not just allow it). As the owner, approve it in the bell, then the manager can book it once.

## Money (always do this section when money, returns or approvals changed)
- [ ] **Mark delivered** on SWSTAGE01 (Asha): collect the full deposit and rent in Cash. Delivered, two payments, nothing doubled. Tapping the button twice quickly makes only one delivery.
- [ ] **Shortfall** on SWSTAGE02 (Bina): collect part of the rent. As a manager it asks for a reason and goes to the owner; the money received stays recorded; the booking is not delivered. The owner approves; the manager delivers.
- [ ] **Deliver anyway** (deliver a dress that shows as not ready): the owner sees "For your information" in the bell. Nothing blocks the delivery.
- [ ] **Record payment** works from the booking screen, Finance and the Cash Counter. A negative or zero amount is refused.
- [ ] **Process return** on a delivered booking: the late fee is filled in from the days late, the screen shows "Hand back ₹...", and after Complete return the refund and deposit kept match. Changing the late fee still works and the owner is told.
- [ ] Cancel the return screen, then close the booking screen with X and with Escape: both close.

## Alerts and the owner's pages
- [ ] The bell shows separate counts (critical, approvals, other). No packed-and-checked alerts.
- [ ] A dress due back on time with a delivery 3 days away does **not** raise an alert.
- [ ] **Delivery Confidence**: shows the next 7 days with colours and the cause; "Near-miss log" opens without an error.
- [ ] Dashboard: go back to an earlier month: its figures appear. The 13-month chart and Team Momentum show numbers.
- [ ] Reports and Customers load all history (may take a moment, then stay fast).
- [ ] Settings: the new "free days before a late fee starts" field saves.

## Reminders (only if reminders were touched)
- [ ] `curl -H "Authorization: Bearer YOUR_STAGING_CRON_SECRET" "https://YOUR-PREVIEW-LINK/api/cron/digest?slot=morning&dry=1"` returns the message text and sends nothing.

## After release (5 minutes, on the live site, as the owner)
- [ ] Sign in; the Dashboard loads; no error screen.
- [ ] Open one real booking and one real customer; open the bell.
- [ ] Run the reminder `dry=1` curl above against the live address; it returns text.
- [ ] Do **not** create test bookings on the live site. If you must, cancel them straight away and tell the owner.
