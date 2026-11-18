# Mobile comfort pass (19 Nov 2026)

One file changed: `app/globals.css` (full file, built on the version in swaasa-site.rar, so nothing from earlier fixes is lost). A short block was added at the very end. No component, database or functionality change.

## What it does (phones and tablets only; desktop with a mouse is unchanged)
1. **No zoom when tapping a field.** iPhone zooms the page when a field under 16px is tapped. Many staff fields were 12-14px (return wizard, booking and calendar filters, date pickers, alteration filters). All fields are now 16px on touch devices.
2. **Easier taps on small buttons.** The 3-dot row menu (about 25 x 23px), the menu icon, the bell, the popup close button and the small buttons get an invisible tap area of about 44px. Look and layout are unchanged.
3. **No double-tap zoom** on buttons, links and fields.
4. **Popups fit the visible screen.** Return wizard, inventory and dry-cleaning popups now use the visible height, so bottom buttons are not hidden behind the browser toolbar. Collection and home pages too.
5. **Sideways phone fix.** Top bar, content and bottom bar keep clear of the notch and rounded corners when the phone is turned sideways; the booking popup header clears the status bar when installed to the home screen.
6. Stops iOS from enlarging text when the phone is rotated.

## Apply
Replace `app/globals.css` in GitHub with the one in this zip, then let Vercel build.

## Check on a phone after the build
- Tap a field in Return a dress, Bookings filters and Calendar: the page should not zoom.
- Tap the 3-dot menu on an Inventory or Bookings row, and the bell: should open on the first try.
- Open Return a dress: the bottom buttons are visible without scrolling the page.

## Not in this zip (needs screen-by-screen work, see review)
Phone card views for Alterations, Dry Cleaning, Finance and Deliveries tables; aligning the 700px / 860px switch points.
