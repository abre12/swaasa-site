# Reels carousel: mobile tap and swipe fix (15 Nov 2026)

No database change. Replace 1 file (same path) and upload to GitHub:

- app/globals.css

Cause: the small tap-area added around the dot buttons (`.cl-dots button:before`) was also applied to the Previous/Next arrows that appear under the carousel on phones. Those arrows are not positioned, so their invisible area stretched over the whole carousel. Every tap landed on the Next arrow (so it only moved to the next reel and never played) and touches could not start a swipe.

Fix: the rule now applies only to the dots themselves (`.cl-dots>button`). Nothing else changed.

Tested in a phone-sized touch browser: swiping left and right moves between reels, tapping the centred reel plays it with sound and tapping again pauses, tapping the edge of the next reel centres and plays it, dots and the Previous/Next arrows still work, and desktop arrows and clicking still work.

Note: this globals.css also contains the Inventory Edit button styles from swaasa-inventory-edit.zip (harmless if that zip is already applied).
