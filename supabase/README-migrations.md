# Database scripts: what to run, and in which order (OP-2)

This list was checked by applying every script below, in this order, to an empty test database. The result is `schema-current.sql`.

## Which situation are you in?

| Situation | What to run |
| --- | --- |
| **Your live database today** (already has bookings) | Only the migrations it has not had yet. The newest are **v26** (before deploying) and **v26b** and the new **v27** (after testing). Never run `schema-current.sql` on it. |
| **A new project** (staging copy, rebuild) | Run `schema-current.sql` once, then its SEED section, then create the owner. Nothing else. |

## The full order (for the record)

| # | File | What it does | Notes |
| --- | --- | --- | --- |
| 1 | `schema.sql` | The first database: tables, the double-booking rule, access rules, dress-photo bucket | Old: it still contains the tables and functions that v22 later removes |
| 2 | `update-busy-function.sql` | Lets the page tell "inside the cleaning gap" from "booked" | Superseded by the next file |
| 3 | `update-staff-booking.sql` | Staff bookings and the cleaning-gap override | **Do not run after `schema.sql` on a fresh database** (it fails with "already exists"). It was only for databases that were built before it. |
| 4 | `migration-v2.sql` | Roles (owner / manager / preparation), keeps all existing data | Bookings can now be read only by owner and manager |
| 5 to 9 | `migration-v3.sql` ... `migration-v9.sql` | Payments, cash counter, deposit use, finance | |
| 10 | `migration-v10.sql` | Return inspections, cleaning queue, alterations, notifications | |
| 11 | `migration-v11.sql` | Alteration queue fills itself from bookings | |
| 12 | `migration-v12.sql` | Alteration checklist and measurements | |
| 13 | `migration-v13.sql` | Damaged queue in Alterations | |
| 14 | `migrationcpt-v13b.sql` | Booking wizard fields, atomic payment capture | **File name says v13b, README says v14.** Run it right after v13. |
| 15 | `migrationcpt-v13c.sql` | Event type/date in the booking details view | Header says "v14". Run it right after v13b. |
| 16 | `migration-v14.sql` | Booking flow overhaul | |
| 17 | `migration-v15.sql` | Owner approvals in the bell | |
| 18 | `migration-v16-performance.sql` | Speed (indexes) | |
| 19 | `migration-v17-readiness-return-delivery.sql` | Readiness model, atomic return, delivery guard | |
| 20 | `migration-v18-cancellation-policy.sql` | Cancellation policy | |
| 21 | `migration-v19-alteration-gap.sql` | No alteration on a dress that is out | |
| 22 | `migration-v20-controls.sql` | Stage-two controls (approvals, photos, events) | |
| 23 | `migration-v21-medium-items.sql` | Medium-priority items | |
| 24 | `migration-v25-phase1.sql` | Phase 1 part 1 (additive) | Website v25 is deployed after this |
| 25 | `migration-v22-cleanup.sql` | Drops objects nothing uses (old public booking, try-on) | Runs after the new website is live. It sits after v25 in time even though its number is lower. |
| 26 | `migration-v25b-lockdown.sql` | Phase 1 lock-down | After testing |
| 27 | `migration-v26-phase2-batchA.sql` | Phase 2 batch A part 1 (additive) | Before deploying the batch A website |
| 28 | `migration-v26b-lockdown.sql` | Phase 2 batch A lock-down | After testing batch A |
| 29 | `migration-v27-phase2-customers-nearmiss.sql` | Customers table, delivery confidence log | Before deploying this website (additive) |

There are no v23 or v24 files; those numbers were used for website-only versions.

## Rules going forward
- Every new migration gets the next number and is added to this table **and to `migration-order.txt`** in the same change.
- Then regenerate the single file: `PGHOST=... PGUSER=... bash supabase/tests/regenerate-schema.sh` (needs Postgres tools and python3). Commit the new `schema-current.sql`.
- `bash supabase/tests/run.sh` (also run automatically on every pull request) fails if the migrations and `schema-current.sql` disagree, or if a money, approval, customer or permission rule stops working. Add a check to `supabase/tests/001_core.sql` for any new rule of that kind.
- Test a new migration on the staging project first (`docs/STAGING.md`, `docs/RELEASE.md`). `staging-sample-data.sql` gives it made-up data.
