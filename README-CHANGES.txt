Swaasa homepage update

This package contains the homepage updates and earlier FAQ, category image, booking entry, hero, review, and studio changes.

Latest reel and category refresh:
- Selected reels are larger and more prominent when brought into focus; the carousel remains compact between selections on desktop and mobile.
- Reception Looks uses a realistic champagne-and-rose boutique photograph.
- Bridesmaids uses a candid photograph of two friends in sage and lilac at a Kerala wedding courtyard.
- Other occasions now uses a dusty-rose luxury salwar suit photograph, inspired by the supplied reference and shown on a different model.
- Bridal Lehengas keeps its original outfit and pose with a warm boutique background; Sangeet & Mehendi keeps its original outfit and dance pose with a festive courtyard background.
- Category image URLs are retained.

Latest category style update:
- The five categories use circular image portraits, warm neutral backdrops, uppercase serif labels, and italic captions.
- On smaller screens the categories remain in a swipeable horizontal row.

Other included homepage changes:
- The homepage hero uses the generated luxury bridal campaign image with a mobile crop that keeps the bride in view.
- The hero’s “Track your booking” link scrolls directly to the section headed “ALREADY BOOKED?”.
- The studio feature uses the supplied boutique photo and the steps “Share your occasion”, “Choose a visit date”, and “Try a few looks”.
- Homepage order is Plan a visit, Track your booking, Google reviews, FAQs, then Visit our studio.
- The FAQ panel is compact and sits above the studio address section.
- The visit request form follows the supplied desktop and mobile layouts.
- The original saved Google review cards are restored; live Places reviews are appended when configured.
- Admin settings can manage homepage FAQs and category images. Five generated category images and settings support are included.
- Supabase migrations v35 and v36 were applied previously; v37 is included to refresh alt text for the bundled category photos.

Customer Stories update:
- Added a Customer Stories page, linked from the homepage navigation, Google reviews section, and footer.
- Added owner settings to add, edit, publish, reorder, and delete reviews, manage multiple photos per review, and create entries for the photos-only gallery.
- Review photos can be swiped on touch screens and navigated with arrows/dots; the separate gallery contains photos only.
- Added stories for Ashli Elizabath Chacko, Littu Mol, Rohini Devi R, Malavika, Aswathy S Nair, Varadha A, and Pratheeksha G P. Reshma Gopi has separate reception and wedding stories. Multiple photos stay grouped with their matching review.
- Removed visible Instagram carousel-arrow overlays from the supplied Reshma and Pratheeksha photographs before adding them to the site.
- Added Supabase migration v38 for owner-managed story content and the public customer-story image bucket. Apply it before deploying the site changes.

Customer Stories gallery update:
- The celebrations strip glides continuously from left to right, pauses on hover or while a photo is open, and resumes after the pointer leaves. It remains manually swipeable; reduced-motion preferences disable automatic movement.
- Hovering a photo enlarges its card slightly. Clicking opens a full-size lightbox that can be closed with Escape, the close button, or the backdrop.
- Review-card photos no longer repeat in the photo galleries. Admin has separate review and photo-only sections; unnamed sets feed the strip, while sets with the same customer/group name merge into swipeable albums below it.
- Photo-only uploads no longer require hand-written image descriptions to save; a useful default description is stored automatically. Use “Add photo set” in the Photo-only galleries section, then “Save photo set” to publish it. Photos attached to a review card stay with that card and are not duplicated in the gallery.
- New entries start at the top. Admin supports drag or up/down controls to reorder stories and photo sets, followed by a Save order action. Review cards and albums use a wider responsive grid that fits up to four cards per row on wide screens and adapts down to mobile.
- This update reuses the existing v38 Customer Stories table and needs no additional database migration.

Editable homepage caption:
- Home Images settings now includes an editor for the line beneath “Find your look”. Save an empty caption to hide the line; the existing wording remains the default until the database migration is applied.
- Added Supabase migration v39 for public caption reading and owner-only updates. Apply it before deploying this version or saving the caption in admin.

Replace the matching files in the existing Swaasa site project. The source has not been deployed to Vercel.
