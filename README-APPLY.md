# Settings page redesign

Copy these files over the same paths in the site (keep the folder structure):

- components/admin/SettingsPage.tsx   NEW: the tabbed Settings page
- components/admin/StaffAdmin.tsx     layout only, same actions
- components/admin/MfaSetup.tsx       layout only, same actions
- components/admin/icons.tsx          adds two icons (lock, store)
- components/AdminApp.tsx             now uses SettingsPage
- app/globals.css                     new .stg-* styles added at the end

Delete components/admin/SettingsForm.tsx (no longer used).
No database change is needed.
- app/login/page.tsx                 authenticator name set to SWAASA Wedding Rentals
