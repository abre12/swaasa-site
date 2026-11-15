# Fix: false "still with <customer>" warning (15 Nov 2026)

Replace components/BookingFlow.tsx. No database change.

The warning now appears only when the other rental comes BEFORE the new booking. If the other booking starts after the new one ends, it is not shown.
