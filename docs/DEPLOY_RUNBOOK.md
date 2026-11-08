# DEPLOY_RUNBOOK.md

Exact steps to put the roles, accounts table and 2-step login work on the real site without breaking it. Plain English on purpose. Commands are for **PowerShell on Windows**.

> **Status:** written 2026-11-08. Nothing in here has been run against Supabase or Vercel yet. Every step that changes something says so.
> The migration file is `drizzle/0006_single_role.sql`. The undo file is `docs/rollback/0006_down.sql` (tested on a local copy of the database, `tests/unit/migration-0006-down.test.ts`).

## Rules for the whole runbook

1. **Two Supabase projects.** A **TEST** project (you make it in part A) and the **LIVE** project. Do everything on TEST first.
2. **Never put a key or a database password in a file in the repo, or in a chat.** The repo is public.
3. **Do not edit `.env.local` to switch projects.** It points to LIVE. To work on TEST, set the variables for the current PowerShell window only (section A2). Close the window when you are done, and the variables are gone.
4. **Before every command that changes a database, check which project it will use** with `pnpm db:check`. It shows the host and the user (never the password). The host must contain the project ID of the project you mean. LIVE and TEST have different IDs: write both on paper now.
5. Do the live steps (part B) when nobody is using the site, and not around 03:17 UTC (the daily cleanup job runs then).
6. Do not run a step you do not understand. Stop and ask.

---

## A. The TEST Supabase project

### A1. Make the project
1. supabase.com > **New project**. Name: `rg-bookkeeping-test`. Same region as the live project. Choose a **new** database password (letters and numbers only). Save it in your password manager.
2. Wait until it is ready. Then do the same settings as the live project, from `docs/AUTH_AND_ROLES.md` section 2:
   - Authentication > Sign In / Providers > Email: Confirm email **ON**, Allow new users to sign up **ON**, minimum password length **12**.
   - Authentication > URL Configuration: Site URL `http://localhost:3000`. Redirect URLs: `http://localhost:3000/**` (you add the Vercel preview address in part D).
   - Authentication > Emails > Templates: the two templates from section 2 step 3 (Confirm signup, Reset password).
   - Emails: Supabase's own email sends only to your team and only about 2 per hour. That is enough for this test if you use **your own email address** as a team member. (Or set up Brevo SMTP as in section 2 step 4.)
3. Authentication > **Multi-Factor**: check that TOTP is enabled (it is by default).
4. Settings > Data API: if the live project limits the API for the `public` schema, do the same here.
5. From **Connect** copy these four values into a safe place (not in the repo): Project URL, publishable (anon) key, secret (service role) key, and the two database addresses: **Transaction pooler** (port 6543) and **Session pooler** (port 5432).

### A2. Point this PowerShell window at TEST
Open a **new** PowerShell window in the `rg-app` folder. Paste this, with your TEST values (this changes nothing on disk):

```powershell
$env:DATABASE_URL            = "<TEST transaction pooler address, port 6543>"
$env:DIRECT_DATABASE_URL     = "<TEST session pooler address, port 5432>"
$env:NEXT_PUBLIC_SUPABASE_URL             = "<TEST project URL>"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "<TEST publishable key>"
$env:SUPABASE_SECRET_KEY     = "<TEST secret key>"
$env:TOKEN_HASH_SECRET       = "<a long random text, new, only for TEST>"
$env:NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"        # Cloudflare's public test key: always passes
$env:TURNSTILE_SECRET_KEY    = "1x0000000000000000000000000000000AA"      # Cloudflare's public test secret: always passes
$env:BREVO_API_KEY           = "<your Brevo API key, or leave empty: then no notification emails are sent>"
$env:EMAIL_FROM_ADDRESS      = "<your verified Brevo sender>"
$env:EMAIL_FROM_NAME         = "RG's Bookkeeping (TEST)"
$env:ADMIN_NOTIFY_EMAIL      = "<your own email>"
$env:APP_BASE_URL            = "http://localhost:3000"
$env:SEED_OWNER_EMAIL        = "<an email you can open, for the TEST owner>"
$env:SEED_OWNER_NAME         = "Test Owner"
$env:SEED_OWNER_PASSWORD     = "<a strong password, 12+ letters, only for TEST>"
Remove-Item Env:ADMIN_REQUIRE_2FA -ErrorAction SilentlyContinue         # not set = 2-step login REQUIRED (what we want to test)
Remove-Item Env:DEV_ADMIN_BYPASS_EMAIL, Env:DEV_USER_BYPASS_EMAILS -ErrorAction SilentlyContinue
```

Check where you point:
```powershell
pnpm db:check
```
Both lines must say `CONNECTED`, and the host must have the **TEST** project ID. If it shows the LIVE ID, **stop**, close the window and start again.

Dotenv does not overwrite variables that are already set, so these values win over `.env.local`. (That is why the check above matters: a variable you forgot to set would still come from `.env.local`, which is LIVE. Set all the ones above.)

### A3. Rehearsal: start from the OLD code and OLD database (recommended)
This makes the TEST database look like the LIVE one is today, so you rehearse the real migration with real-shaped data.

1. Make a second copy of the old code (this only adds a folder, it does not touch your branch):
   ```powershell
   git worktree add ..\rg-app-before fdb2ae8
   cd ..\rg-app-before
   pnpm install
   ```
   `fdb2ae8` is the last commit before the roles work.
2. In this same window the TEST variables from A2 are still set. Run:
   ```powershell
   pnpm db:check
   pnpm db:migrate        # old migrations 0000 to 0005 on TEST
   pnpm storage:setup     # the two storage buckets on TEST
   pnpm db:seed           # makes the old-style owner from SEED_OWNER_* (admin_profiles + profile "admin")
   ```
3. Make some old-style accounts so the mapping is real. Register 3 accounts on the TEST site (`pnpm dev` in the old folder, open `http://localhost:3000/register`, use your own email with `+tag`, like `you+client1@gmail.com`, open the email links): `client1`, `staff1`, `admin2`. In the TEST SQL editor make `staff1` an old-style staff admin and `admin2` an old-style owner:
   ```sql
   -- replace the emails
   begin;
   update public.profiles set role = 'admin' where email in ('you+staff1@gmail.com', 'you+admin2@gmail.com');
   insert into public.admin_profiles (id, full_name, email, role)
     select id, 'Staff One', email, 'staff' from auth.users where email = 'you+staff1@gmail.com';
   insert into public.admin_profiles (id, full_name, email, role)
     select id, 'Admin Two', email, 'owner' from auth.users where email = 'you+admin2@gmail.com';
   commit;
   ```
4. Run the **M1 query** (part B step 3) on TEST. This is exactly what you will do on LIVE.
5. Go back to the new code and apply the new migration:
   ```powershell
   cd ..\rg-app
   pnpm db:check          # host must still be the TEST host
   pnpm db:migrate        # applies 0006
   ```
   Then run the "confirm the result" queries (part B step 6) on TEST.
6. Remove the extra folder when you are done:
   ```powershell
   git worktree remove ..\rg-app-before --force
   ```

If you skip A3 (an empty TEST project instead): in the new `rg-app` folder run `pnpm db:migrate`, `pnpm storage:setup`, `pnpm db:seed`. The seed makes an **owner** account.

### A4. Run the app against TEST
In the same window (variables set), in `rg-app`:
```powershell
pnpm dev
```
Open `http://localhost:3000/login` and sign in with `SEED_OWNER_EMAIL`. 2-step login is **required** (the flag is not set), so you are sent to set up devices.

### A5. A real two-authenticator recovery test
You need **two authenticator apps that can hold codes**: for example your phone app **and** a second app or device (another phone, a tablet, or a desktop authenticator such as the browser extension "Authenticator" or Microsoft Authenticator on a second phone). Real codes are required: this is the test that the fakes in our unit tests cannot do.

**Part 1: the two-step setup**
1. Sign in as the TEST owner. You land on `/admin/mfa/setup`: "Step 1 of 2: your authenticator app".
2. Name the device `Phone A`. Scan the QR code with app 1. Type the code. It says step 2 of 2.
3. Name the second device `Phone B`. Scan with app 2 (or scan the same QR on a second phone). Type the code. You must reach the admin area **only now**. ✔ Write down: did step 2 refuse to be skipped? (There must be no link to skip it.)
4. Open `/admin/security`. You see both devices with the date. ✔
5. Sign out. Sign in again. At the code step type a code from **Phone B** only. ✔ It must work.

**Part 2: remove a device (needs another device)**
6. On Security click **Remove** next to `Phone A`. Type a code from **Phone A** itself. ✔ Refused ("Enter a code from a DIFFERENT device").
7. Type a code from **Phone B**. ✔ `Phone A` is removed. The activity log has `mfa.device_removed`.
8. Try to remove `Phone B` (the last one). ✔ There is no Remove button ("Your only device"). (Optional: replay the request with the browser tools: refused.)
9. Add `Phone A` again (Add a device) so you have two devices again.

**Part 3: reset by another person (a lost phone)**
10. As the owner open Settings > Admin users > **Invite**. Invite a staff account: `you+staff2@gmail.com`, role Staff, "Make a temporary password". Enter your own code at the confirm.
11. Open a private window. Sign in as `staff2` with the temporary password. You must choose your own password. Then complete the two-step setup (two devices) for `staff2`. ✔ Staff menu: only Requests, Services, Activity, and the Security link.
12. Back as the owner: Admin users > the row of `staff2` > **Actions > Reset 2-step login**. Enter **your own** code. Type `staff2`'s email. Press the button.
13. ✔ `staff2`'s private window is signed out at the next click. ✔ `staff2` received an email "Your 2-step login was reset" (check the mailbox; needs the Brevo key). ✔ The activity log has `account.2fa_reset`. ✔ The Admin users table shows 2-step login **Off** for `staff2`.
14. Sign in as `staff2` again: you must set up **two new devices** before the admin area opens. ✔
15. Make an **admin** account the same way (invite `you+admin3@gmail.com` as Admin) and set it up. As **admin3** reset the **owner's** 2-step login. ✔ It is allowed. ✔ The owner (and every owner) gets an email. ✔ The owner must set up two new devices.
16. As admin3 try to **demote or turn off** the owner. ✔ Refused ("Only an owner ...").
17. Try "Reset 2-step login" on your own row. ✔ There is no menu on your own row.

**Part 4: layer 3, the dashboard** (`docs/RECOVERY.md`)
18. Make a test staff account, set up devices, then follow `docs/RECOVERY.md` layer 3 steps 3b to the end for that account, in the **TEST** dashboard. ✔ The person can sign in and is made to set up again.

**Part 5: the other checks**
19. Do the whole manual test list in `docs/AUTH_AND_ROLES.md` section 9 (staff on hidden addresses, replayed forms, the accounts table, phone layout at 390 px).
20. Test **Turn account off** on `staff2`: they are signed out, cannot sign in even with the right password, get an email; **Turn on** lets them in again.

Write the result of each ✔ in a note. **If any step fails, stop and do not go to part B.** Send me the step number and what you saw.

### A6. Keep the TEST project
Do not delete it. It is free, and you will use it for every later risky change. (Deleting a test user can be blocked by the "last owner" rule, which is correct.)

---

## B. The LIVE migration

Do this only after part A passed.

### B0. What happens to the live site (read first)
- Migration 0006 removes the table `admin_profiles`. The **old** code on the live site needs that table for the admin area. So from the moment you migrate until the new code is deployed, **the admin area and admin sign in are broken**. Clients can still use the public pages.
- The **new** code on a database that has **not** been migrated fails at every sign in (it reads columns that do not exist yet).
- So the order is: **migrate first, then deploy right away**. The gap should be a few minutes.
- If the new code is **already deployed** (see part E: check what Vercel shows as production), the live sign in may already be broken. Then migrate **now**, and skip step B8.

### B1. Choose the moment
A quiet time, not 03:17 UTC, you have an hour, and the Vercel dashboard open. Tell the owner the admin area will be unavailable for a few minutes.

### B2. Back up
Supabase's free plan has **no automatic backups**. Make two:
1. In the admin area (old site) open **Export** and download both CSV files.
2. A full copy of the data. Install the PostgreSQL command line tools if `pg_dump` is not found (postgresql.org/download/windows: choose "Command Line Tools" only). In a **new** PowerShell window set **only** the LIVE session address:
   ```powershell
   $env:DIRECT_DATABASE_URL = "<LIVE session pooler address, port 5432>"
   New-Item -ItemType Directory -Force "$HOME\rg-backups" | Out-Null
   pg_dump "$env:DIRECT_DATABASE_URL" --schema=public --no-owner --no-privileges -f "$HOME\rg-backups\live-before-0006.sql"
   (Get-Item "$HOME\rg-backups\live-before-0006.sql").Length
   ```
   The size must be more than a few KB. **Never put this file in the repo.** It has client data.
3. In Supabase > Table editor, export `profiles` and `admin_profiles` as CSV (small, and the part this migration changes).

### B3. M1: look first, change nothing
In the LIVE Supabase SQL editor run this. It only reads:
```sql
select p.email, p.full_name, p.role as account_role, a.role as level, a.is_active
from public.profiles p left join public.admin_profiles a on a.id = p.id
where p.role = 'admin' or a.id is not null order by p.email;
```
Send the rows to me. We compare them with: Rosemarie Gallego -> owner, Derx Ramos -> admin (set by hand later), every other account -> user. **If anything does not fit, stop here.** The migration maps `admin_profiles` owner -> owner, staff -> staff, an admin that was removed -> user, everybody else -> user.

Also run, and write the numbers down:
```sql
select count(*) as profiles from public.profiles;
select count(*) as logins from auth.users;
select count(*) as admin_rows from public.admin_profiles;
select count(*) as requests from public.requests;
```

### B4. Point at LIVE and check
A **new** PowerShell window in `rg-app` (so no TEST variables are left). `.env.local` already holds LIVE. Run:
```powershell
pnpm db:check
```
The host must have the **LIVE** project ID. Both lines `CONNECTED`. If not, stop.

### B5. Apply the migration (this changes the live database)
```powershell
git status -sb          # must say: on main, nothing to commit
pnpm db:migrate
```
This also applies 0004 and 0005 if they are still waiting. Drizzle applies all waiting migrations inside **one transaction** (the code in `drizzle-orm` does `session.transaction`; I read it, I have not run it on Supabase). So if one statement fails, nothing is changed. You will confirm that with the next step. If you see an error: **do not run anything else**, go to part C step C4.

### B6. Confirm the result
In the LIVE SQL editor:
```sql
-- 1. the old table and types are gone, the new type is there (expect: false, false, true)
select to_regclass('public.admin_profiles') is not null as old_table_still_there,
       exists (select 1 from pg_type where typname = 'app_role') as old_role_type_still_there,
       exists (select 1 from pg_type where typname = 'account_role') as new_role_type;

-- 2. the accounts (compare with M1: same people, owner/staff/user as planned)
select email, role, is_active, mfa_reset_required from public.profiles
where role <> 'user' order by role, email;
select role, is_active, count(*) from public.profiles group by 1, 2 order by 1, 2;

-- 3. at least one active owner (expect 1 or more)
select count(*) from public.profiles where role = 'owner' and is_active;

-- 4. same numbers as before the migration (profiles, logins, requests)
select count(*) from public.profiles; select count(*) from auth.users; select count(*) from public.requests;

-- 5. every policy is for the authenticated role only
select policyname, roles from pg_policies where schemaname = 'public';

-- 6. the migration was recorded (the newest row is 0006)
select id, created_at from drizzle.__drizzle_migrations order by id;
```
Everything must match. If not: part C.

### B7. Make the developer an admin
Only after B6 is good, and only if the owner account is active:
```sql
update public.profiles set role = 'admin' where email = '<DEVELOPER EMAIL>';
select email, role from public.profiles where role in ('owner', 'admin') order by role;
```
(The database refuses this if it would leave no active owner.)

### B8. Deploy right away (you do this yourself)
Make sure part E step 1 says your commits are the ones you want. Then:
```powershell
git push origin main
```
Open Vercel > the project > **Deployments**. Wait for the newest deployment to become **Ready** and labelled **Production**. If it fails: part C step C2 (the old deployment is still serving, as long as the new build did not finish).

### B9. Check the live site
1. Open the site. The home page and Services load.
2. Sign in as the owner. The Dashboard opens. The header says **Owner**. Settings > Admin users shows the table. 2-step login is still **off** while `ADMIN_REQUIRE_2FA` is `false` in Vercel (the red banner shows: this is expected, and the "Before launch" item in PROGRESS.md stays).
3. Sign in as the developer (admin). Header says **Admin**.
4. Sign in as a client (a test client account). My requests works. `/admin` shows "Not allowed".
5. Create a staff account (Invite) and check the staff menu (Requests, Services, Activity).
6. Check Vercel > the deployment > **Logs**: no repeated errors.

### B10. Later, before real clients
Turn 2-step login on (`docs/AUTH_AND_ROLES.md` section 8). Every staff, admin and owner then sets up two devices. Do this on TEST first (part A5 already did).

---

## C. Something fails: rollback and undo

### C1. Which problem do I have?
| What you see | What to do |
|---|---|
| `pnpm db:migrate` printed an error | C4 |
| The migration finished, the new site is not deployed yet, the checks in B6 are wrong | C3 (undo the migration) |
| The new deploy failed to build | C2: the old deployment keeps serving. Fix the problem. Do not undo the migration if the old code can live with it (it cannot: the admin area is closed until a good deploy). Fix forward quickly. |
| The new deploy is live but sign in fails or the admin area is broken | First read the Vercel logs. If you cannot fix it in 15 minutes: C3 then C2. |
| Only a visual problem | Fix forward. No rollback. |

**Important:** the old code cannot work on the migrated database, and the new code cannot work on the old database. So a code rollback and a migration undo go **together**. Order for a full rollback: **undo the migration (C3), then roll back the deploy (C2)**.

### C2. Roll back the Vercel deploy
1. Vercel > the project > **Deployments**.
2. Find the deployment that was Production **before** your push (look at the commit message and time).
3. Click the three dots on it > **Instant Rollback** (or open the deployment and use the Rollback button).
4. Confirm. The site serves the old code at once.
5. The same from the command line (needs `npm i -g vercel` and `vercel login`): `vercel rollback <deployment url>`.

Things to know (from Vercel's documentation):
- On the free **Hobby** plan you can roll back **only to the previous production deployment**. Going further back needs a paid plan. If the previous one is not the one you want, use **Redeploy** on an older deployment instead.
- After a rollback Vercel **stops auto-assigning** production to new pushes. Your next push will **not** go live until you promote a deployment again (Deployments > the one you want > **Promote**, or `vercel promote <deployment url>`).

### C3. Undo migration 0006 (this changes the live database)
Use it only if the migration finished and you cannot fix forward. It puts the database back to its shape after migration 0005.
1. **Back up first** (B2, but name the file `live-before-undo.sql`).
2. Open `docs/rollback/0006_down.sql`. Read the comments at the top. It loses: `is_active` of clients, `mfa_reset_required`, `sessions_revoked_at`. The developer admin becomes an old-style **owner** (the old model has only owner and staff). Turned-off staff, admin and owner stay turned off.
3. Copy **all** of the file into the LIVE SQL editor and run it once. It runs in one transaction: if a line fails, nothing changes, and you can send me the error.
4. Forget the migration record, so a later `pnpm db:migrate` can run it again. Check first that the last row is 0006:
   ```sql
   select id, created_at from drizzle.__drizzle_migrations order by id;
   delete from drizzle.__drizzle_migrations where id = (select max(id) from drizzle.__drizzle_migrations);
   ```
5. Confirm (expect: true, true, false):
   ```sql
   select to_regclass('public.admin_profiles') is not null as old_table_back,
          exists (select 1 from pg_type where typname = 'app_role') as old_role_type_back,
          exists (select 1 from pg_type where typname = 'account_role') as new_type_still_there;
   select p.email, p.role, a.role as level, a.is_active
   from public.profiles p left join public.admin_profiles a on a.id = p.id
   where p.role = 'admin' order by p.email;
   ```
   The same people as in M1 (before the migration) should appear. Remember: Derx and Rosemarie are both `owner` level now.
6. Then C2 (roll back the deploy).
7. Last resort: restore from `live-before-0006.sql` into a **new** Supabase project, point the site at it. Do not restore on top of the live project.

### C4. `pnpm db:migrate` printed an error
1. Do **not** run it again, and do not run the undo file yet.
2. Run the checks (expect: `old_table_still_there` true, `new_role_type` false):
   ```sql
   select to_regclass('public.admin_profiles') is not null as old_table_still_there,
          exists (select 1 from pg_type where typname = 'account_role') as new_role_type;
   select id, created_at from drizzle.__drizzle_migrations order by id;
   ```
3. If the old table is still there and there is no new type: nothing was changed (the transaction rolled back). Send me the error text. We fix the file and run again.
4. If something looks half done: stop. Do not run anything else. Send me both outputs and the error. The backup from B2 is the safe way back.

---

## D. Separate Preview environment variables (Vercel preview deployments use the TEST project)

**Why:** the setup guide told you to add every variable to both **Production** and **Preview**. So a preview deployment of any branch currently reads and writes the **LIVE** database. After this part, previews use the TEST project.

### D1. In Vercel
Project > **Settings** > **Environment Variables**. Each variable can be set for Production, Preview and Development separately.
1. For every variable that points to LIVE, edit it and **untick Preview** (keep Production). These are: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `TOKEN_HASH_SECRET`, `ADMIN_NOTIFY_EMAIL`, `BREVO_API_KEY`, `EMAIL_FROM_*`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `GOOGLE_SIGNIN_ENABLED`, `ADMIN_REQUIRE_2FA` (and the others you have).
2. Add the same names again, for **Preview only**, with the **TEST** values:

| Name | Preview value |
|---|---|
| `DATABASE_URL` | TEST **transaction pooler** address (port 6543, host has `pooler.supabase.com`). Never the direct `db.xxxx.supabase.co` address |
| `NEXT_PUBLIC_SUPABASE_URL` | TEST project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | TEST publishable key |
| `SUPABASE_SECRET_KEY` | TEST secret key (mark it **Sensitive** if Vercel offers it) |
| `TOKEN_HASH_SECRET` | a **different** long random text from the live one |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (Cloudflare's public test key) |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` (Cloudflare's public test secret) |
| `BREVO_API_KEY` | your key, or leave the variable out: then previews send no email |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | the same sender; name `RG's Bookkeeping (TEST)` |
| `ADMIN_NOTIFY_EMAIL` | your own email (not the owner's) |
| `ADMIN_REQUIRE_2FA` | **leave it out** (= 2-step login required), so previews behave like the final site |
| `GOOGLE_SIGNIN_ENABLED` | `false` |
| `APP_BASE_URL` | leave it out (the site address is found from Vercel) |

Do **not** add: `DIRECT_DATABASE_URL`, `SEED_*`, `DEV_ADMIN_BYPASS_EMAIL`, `DEV_USER_BYPASS_EMAILS`, `DB_POOL_MAX`.

3. A variable change affects **new** deployments only. Make a preview (D3) to test it.

### D2. In the TEST Supabase project
Authentication > URL Configuration:
- **Redirect URLs:** add `https://*-<your-vercel-team-or-account-slug>.vercel.app/**` (the wildcard covers every preview address; the slug is the part after the project name in a preview address, for example `rg-app-git-feat-x-derx.vercel.app` has the slug `derx`). Also keep `http://localhost:3000/**`.
- **Site URL:** keep `http://localhost:3000` (or one fixed preview address).
Supabase supports `**` in redirect URLs, and this is how email links and sign in come back to a preview.

### D3. Test a preview
1. `git switch -c preview/test-env` and `git push origin preview/test-env` (a branch that is **not** `main`, so no production deploy). Or open any pull request.
2. Vercel > Deployments > the new deployment (label **Preview**) > Visit.
3. Check that it uses TEST: sign up with a `+tag` email. In the **TEST** Supabase > Authentication > Users the user appears, and in the **LIVE** one it does not. Check the Vercel build log: `Database connected` and the TEST host.
4. Delete the test branch when you are done (`git push origin --delete preview/test-env`).

### D4. GitHub Actions
`scheduled-jobs.yml` (cleanup, keep-alive) and `backup.yml` use GitHub **secrets** and always work on LIVE. They are not affected by Vercel variables. If you want the TEST project to be kept awake too (the free plan pauses a project after 7 days), add the same keep-alive with TEST secrets later, or open the TEST dashboard once a week.

---

## E. Which commits are on GitHub, and which deploy is production

### E1. Check from your computer (these commands change nothing except the local copy of the GitHub branch name)
```powershell
cd C:\Users\Derx\Documents\ZOLB\rg-app
git fetch origin
git status -sb
git log --oneline origin/main..main
git log --oneline main..origin/main
git log --oneline -3 origin/main
```
- `git fetch origin` asks GitHub what it has, and updates the local copy of `origin/main`.
- `git status -sb` first line: `## main...origin/main` with **no** `[ahead N]` means GitHub has everything. `[ahead N]` means N commits are only on your computer. `[behind N]` means GitHub has N commits you do not have.
- `git log --oneline origin/main..main` lists the commits that are on your computer and **not** on GitHub. **Empty = everything is on GitHub.**
- `git log --oneline main..origin/main` lists commits on GitHub that you do not have. Normally empty.
- The last command shows the newest 3 commits that GitHub has. The roles work ends with the commit message "Roles phase 7 ..." and the case-study fix.

My report earlier showed `[ahead 8]` and the next look showed `[ahead 1]`: that local copy only changes after a push or a fetch, so the 8 roles commits very likely **are already on GitHub**. Check with the commands above, or on the web: github.com/&lt;your user&gt;/&lt;repository&gt;/commits/main (the newest commits and their dates).

To check one commit directly: `git branch -r --contains 6b17783` should print `origin/main` if that commit is on GitHub.

### E2. In Vercel: which deploy is production
1. vercel.com > your project > **Deployments**.
2. The deployment that serves your real site has the **Production** label (and **Current**). Its row shows the **commit message and hash** and the branch. That is the code the live site runs now.
3. Rows with **Preview** are other branches. They are not the live site.
4. Project > **Settings** > **Git** > **Production Branch**: normally `main`. A push to this branch makes a production deployment.
5. Open the Production deployment > **Build Logs** to see if the build passed, and **Runtime Logs** for errors at sign in.
6. If a deployment of the roles commits is already Production and the database is **not** migrated: sign in on the live site probably fails now. Go to part B and skip step B8.

---

## One-page order (when everything above is clear)
1. Part A: TEST project, rehearsal, real two-authenticator recovery test. All good?
2. Part D: Preview variables point to TEST. (Do this before any more pushes of other branches.)
3. Part B1 to B7: quiet time, backups, M1 (send me the rows), `pnpm db:migrate`, confirm, developer to admin.
4. Part B8: `git push origin main`, wait for Production = Ready.
5. Part B9: check each role. Something wrong? Part C.
