# Inventory: visible Edit option (15 Nov 2026), built on swaasa-site.rar (phase3 + latest fixes)

No database change. Replace these 2 files (same paths) and upload to GitHub:

- components/admin/Inventory.tsx
- app/globals.css (one small block added at the very end)

What changed
- Every dress row in Dress Inventory now has an **Edit** button next to the 3-dot menu (desktop table and phone cards). It opens the same Edit form as "Edit Dress" in the menu (photos, code, name, category, rent, wash charge, sizes, colours, description).
- "Edit Dress" is still in the 3-dot menu.
- The 3-dot menu now stays fully on screen for rows near the bottom of the page.
- Edit is for the owner only, same as Add Dress (the database allows dress changes only for the owner).
