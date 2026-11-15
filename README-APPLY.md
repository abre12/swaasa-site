# Carousel mobile fix

For the site version that already has the customer-page and privacy overlay applied, copy these three folders into the repository root and replace the existing files.

This places the carousel above “Browse by Category.” Mobile swiping uses native horizontal scrolling. Tapping a reel plays and centers that reel; the swipe gesture no longer shares a competing touch-end play handler. The change needs no Supabase migration.
