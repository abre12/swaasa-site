# How to release a change safely (OP-3)

The rule: **nothing goes to the live site until it has been checked, then tried on staging.** This takes about 40 minutes for a normal change.

## 1. Make the change on a branch
Never edit `main` directly. In GitHub, create a branch (for example `fix-late-fee`), put the changed files in it, and open a **pull request**.

## 2. Wait for the automatic checks
Two checks run by themselves on every pull request (`.github/workflows/ci.yml`):

| Check | What it catches |
| --- | --- |
| **Website** | A type error, a lint error, a broken business rule (late fees, alerts, phone numbers, approvals), or a build that fails. |
| **Database** | A money, approval, customer or permission rule that stopped working; `schema-current.sql` no longer matching the migrations. |

A green tick on both means the change is safe to try. **A red cross means do not release.** Open the failed check to see which test failed and why.

## 3. Try it on staging
- Vercel builds a **Preview** link for every pull request automatically. It is connected to the **staging** Supabase project, never the live one (set up once, see `STAGING.md`).
- If the change includes a new database script (`migration-v..`), run it on the **staging** project first, in the SQL editor.
- Go through `SMOKE-TEST.md` on the Preview link. It takes about 25 minutes. If you only changed one area you may do only the sections for that area, but do the **Money** section whenever money, returns or approvals were touched.

## 4. Release to live
1. **Take a backup:** GitHub > Actions > "Database backup" > Run workflow. Wait for the green tick.
2. If there is a database script: run it on the **live** project in the SQL editor, in the order shown in `supabase/README-migrations.md`. Scripts marked "before deploying" go first.
3. Merge the pull request. Vercel deploys `main` to the live site by itself.
4. Run the 5-minute **"After release"** list at the bottom of `SMOKE-TEST.md` on the live site.
5. Scripts marked "lock-down" (v22, v25b, v26b) are run **last**, only after step 4 looks right.

## 5. If something goes wrong
| Problem | What to do |
| --- | --- |
| The website is broken after release | Vercel > Deployments > pick the last good deployment > **Promote to Production**. This takes seconds and does not touch the database. |
| A database script caused it | Most scripts only add things and can stay. If one must be undone, restore from the backup in step 4.1 (`supabase/BACKUP-AND-RESTORE.md`) or run the "To undo" lines at the bottom of that script (v25b and v26b have them). |
| Money looks wrong | Stop delivering and returning, tell the owner, and do not retry. Every payment is recorded once in the database; compare the Cash Counter with the payment list before changing anything. |

## Rules that keep this working
- Every new database script gets the next number, is added to `supabase/migration-order.txt` and `supabase/README-migrations.md`, and `schema-current.sql` is regenerated with `bash supabase/tests/regenerate-schema.sh`. The Database check fails if you forget.
- A new rule about money, approvals or alerts comes with a test in `tests/` or `supabase/tests/`.
- The live Supabase keys are never placed in Preview. Telegram settings are left empty in Preview so a test site can never message the team.
