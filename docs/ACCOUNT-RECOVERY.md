# Sign-in problems: who fixes what

Every staff login has a password, and owner and manager logins also have a 6-digit code from an authenticator app (two-step login, `lib/mfa.ts`).
Passwords the owner types are **temporary**: the person is made to choose their own at first sign-in (`/account/password`), so nobody but the person knows the password they actually use.

| Problem | Who can fix it | How |
|---|---|---|
| A new person joins | Owner | Settings, Staff, **Add a person**. Press **Generate one** for a temporary password and give it to them with their email. |
| A staff member forgot their password | Owner | Settings, Staff, **Reset password**. This sets a new temporary password; the person chooses their own when they sign in. |
| A staff member wants to change their own password | The person | Open `/account/password` while signed in (also in the menu next to Sign out). |
| A staff member lost or replaced their phone (authenticator) | Owner | Remove their authenticator (below, A). At their next sign-in they are taken through setup again. |
| The **owner** forgot their password | Whoever controls the Supabase project | Set a new password in the database (below, B). The app cannot reset the owner's login, on purpose. |
| The **owner** lost their phone (authenticator) | Whoever controls the Supabase project | Remove the authenticator (below, A), sign in, scan the new QR code. |
| Someone who left, or a login you no longer trust | Owner | Settings, Staff, **Delete** (the login is locked for good, their records keep the name). To only pause someone: turn their access off. |

## Prevent the owner lockout (do this once, today)
- When two-step login is set up, the screen shows a **setup key** under the QR code. Copy it into your password manager (or write it down and keep it somewhere safe). With that key any authenticator app can be set up again on a new phone, with no help from anyone.
- Better still, add the same key to **two** phones (for example yours and a trusted family member's).
- Keep the Supabase, Vercel and GitHub accounts on their own two-step login with recovery codes saved. Whoever can sign in to the Supabase project can always recover the owner login, so that account is the real master key.

## A. Remove someone's authenticator
Their password stays; only the 6-digit code is reset. Do this only after you have confirmed by phone or in person that it really is them asking.
1. Supabase dashboard, **Authentication**, **Users**, open the person, and remove their MFA factors (the wording is "Remove MFA factors" or "Delete factor").
2. If your dashboard does not offer that, open the **SQL editor** and run (change the email):
   ```sql
   delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'person@example.com');
   ```
3. Ask them to sign in with their password. Owner and manager logins are sent straight to **Set up two-step login**; scan the new QR code, and save the new setup key.

## B. Set a new password for the owner (or anyone) in the database
1. Supabase dashboard, **SQL editor**. Pick a temporary password of your own (at least 10 characters) and run, changing the email and the password:
   ```sql
   update auth.users
      set encrypted_password = crypt('A-temporary-pass-2026', gen_salt('bf')),
          raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb
    where email = 'owner@example.com';
   ```
2. Sign in with that temporary password and the usual 6-digit code. The site opens **Choose your own password**; pick a new one. The temporary password stops working.
3. Clear the SQL editor history afterwards, because it contains the temporary password.

Notes: try both A and B on the **staging** project first if you have not done them before. The dashboard menu names change from time to time. If a step above does not match what you see, the SQL version always works.

## What the site does on its own
- `must_change_password` lives in the login's `app_metadata`, which only the server key can write. A person cannot switch it off from their own browser; only a successful password change on `/account/password` clears it.
- While it is on, every page sends the person to the change-password screen and every other API answers `403 password_change_required` (`middleware.ts`).
- The two-step code is always asked for first, then the password change.
