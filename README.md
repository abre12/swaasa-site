# Cleaning-period notice names the other customer (15 Nov 2026)

Replace components/BookingFlow.tsx. No database change. Includes all earlier booking fixes (warning, two-way gap, approval at the Payment step); upload only this zip.

The notice now reads, for example: "Check dates for Cleaning & Preparation Period as Krishna has booked the dress from 20 Nov 2026" (or "... has the dress booked until 13 Nov 2026" when the other booking is before yours). Blocks and dry-cleaning periods, which have no customer, keep the plain notice.
