# Dashboard: one block for today and the next 3 days (15 Nov 2026)

No database change. Replace these 5 files (same paths):
- components/admin/Today.tsx
- components/admin/Dashboard.tsx
- app/globals.css
- lib/readiness.ts and lib/alerts.ts (the "Still with <customer>" fix from swaasa-fix-still-with.zip, included so one upload does it all)

What changed
- "Notes for the next days" removed from the Dashboard (notes can still be added and read on each booking).
- The separate "Next 3 days" block, the "Tomorrow's deliveries: get them ready" section and the "Coming up tomorrow" line are merged into ONE section at the end of the Today block: "Coming up: next 3 days".
  - Grouped by day (Tomorrow · D-1, 18 Nov 2026 · D-3), one row per dress, with the event date, ready / not ready, what is pending, and the preparation progress bar.
  - Returns due tomorrow are listed in the same section.
  - A dress already shown higher up (for example under "Needs attention first") is not repeated.
