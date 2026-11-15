# Dashboard declutter (15 Nov 2026), built on swaasa-site-phase3

No database change. Replace these 5 files (same paths) and upload to GitHub:

- components/admin/Dashboard.tsx
- components/admin/Countdown.tsx
- components/admin/HandoverNotes.tsx (DayNotes only)
- components/admin/CloseDay.tsx (the bar only)
- app/globals.css (new block "Dashboard declutter (v29)" added at the end)

## New order, top to bottom
1. Header with a one-line summary: "0 deliveries today · 0 returns due · 1 overdue"
2. Today (needs attention first), now the first block
3. One slim row of 4 numbers (was 3 big cards + 1 orphan): Delivered today, Returns due today, Overdue items, To collect in 7 days (owner)
4. Shortfall approvals bar (only when there are some)
5. Next 3 days: folded into one line ("Next 3 days 1 · 1 still to prepare"), opens to the progress bars. Hidden when nothing is due. Today's deliveries are no longer repeated here.
6. Notes: one line when empty ("Notes for the next days  None  + Add note"), full card when there are notes
7. Workflow row (smaller)
8. End of day: one slim line
9. Team Momentum: folded, opens to the staff chart
