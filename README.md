# Team Momentum: bookings AND actual deliveries, smaller (15 Nov 2026)

1. Run supabase/migration-v29-staff-deliveries.sql in Supabase > SQL Editor (one new read-only function; safe to run again).
2. Replace these files (same paths) and upload to GitHub:
   - components/admin/BookingsByStaff.tsx
   - components/admin/Dashboard.tsx
   - app/globals.css   (this file also carries the earlier Dashboard changes; it replaces the one in swaasa-changes-dashboard-merge.zip)

What changed
- This Month: each staff member now has two bars side by side, fresh bookings (burgundy) and deliveries (green); the staff summary shows "bookings · deliveries".
- Month on Month: each month has the stacked bookings bar (by staff) with a green deliveries bar next to it.
- A delivery = a dress actually handed over (marked delivered), counted in the month of hand-over, for the staff member who recorded it. Bookings still count by booking date.
- Smaller: shorter chart, smaller heading, no second box inside the folded Team Momentum panel.
- Until the migration is run, deliveries are counted from the last 90 days of bookings the device already holds.
