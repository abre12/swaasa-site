# Favicon: transparent background

Replace these two files in public/:
- favicon.ico (16, 32 and 48 px, transparent): this is what the browser tab uses.
- icon-192.png (192 px, transparent): some browsers pick this one for the tab instead.

Both were rebuilt from public/logo-mark.png (the gold mark, already transparent). The mark is cropped tight so it fills the
square, and the lines are slightly bolder and a touch deeper gold at the small sizes so they stay readable on a white tab.

Left alone on purpose: apple-touch-icon.png and icon-512.png keep their dark square. iPhones turn a transparent home-screen
icon black anyway, and Android crops icons into shapes, so a solid background looks better there.

Browsers keep favicons for a long time. After it deploys, hard-refresh (Ctrl+Shift+R) or open the site in a private window to see the change.
No code change, no database change. The existing tests still apply (sizes unchanged).
