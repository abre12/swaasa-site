# Fix: false "Still with <customer>" on the dashboard and readiness checks (15 Nov 2026)

Replace lib/readiness.ts and lib/alerts.ts. No database change.

A booking was shown as "not ready: still with X" whenever ANY other rental of the same dress was marked out, even one that starts after it. Now only a rental that starts before the booking can hold the dress. This also corrects the "not back" count in the 5 PM Tomorrow summary.
