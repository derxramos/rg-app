# AUTH_AND_ROLES.md

How accounts, roles and sign-in work in this app. Plain English on purpose.

> Status: built on the branch `feat/roles-accounts-recovery`. **Nothing here has been run on a live Supabase project yet.**
> Sections 2 to 4 are steps you do by hand. Section 9 is the manual test list. Lost phone? See `docs/RECOVERY.md`.

---

## 1. The idea

- One sign-in page for everyone: `/login`. Supabase Auth, email and password.
- **One role column** in the `profiles` table, with four values:

| Role | Who | In short |
|---|---|---|
| `user` | A client | Makes requests and sees "My requests". No admin area. |
| `staff` | A future employee | Requests, services and checklists, activity (read only). Nothing else. |
| `admin` | The developer | Everything the owner can do, except changing an owner account. |
| `owner` | The business owner | Everything. |

- The role is always read from the database on the server. It is never taken from the browser or from the token.
- A new sign-up is always `user`. A database trigger does this. Nobody can change their own role (see `docs/DATABASE.md`).
- Anyone can still follow a request with the tracking code and the last 4 digits of the phone (`/track`).
- **Role rules:**
  - Nobody can change, turn off or reset their own account.
  - There is always at least one active owner (code check and a database trigger).
  - Only an owner can invite, promote, demote or turn off an owner. An admin can do everything else an owner can do. An admin **may** reset an owner's 2-step login (this is how a lost owner phone is fixed); then every owner gets an email.

### ONE permission table

`src/lib/permissions.ts` has one function, `can(role, action)`, and one table. Menus, pages, Server Actions, services and tests all use it. The SQL function `private.role_can()` says the same (a test compares every cell).

| Action | user | staff | admin | owner |
|---|---|---|---|---|
| Dashboard | – | – | ✓ | ✓ |
| Requests: view, change status, add notes, retry email | – | ✓ | ✓ | ✓ |
| Requests: view client documents (every open is logged) | – | ✓ | ✓ | ✓ |
| Mark a payment verified or rejected | – | – | ✓ | ✓ |
| Record a payment made outside the website (cash, bank transfer, other) | – | ✓ | ✓ | ✓ |
| Void a recorded offline payment | – | – | ✓ | ✓ |
| Delete client data (privacy request) | – | – | ✓ | ✓ |
| Services and checklists: view, add a service, change names and descriptions, add, edit and move checklist items | – | ✓ | ✓ | ✓ |
| A service made by staff starts **hidden and with no fee** | – | ✓ | – | – |
| Services: change the fee, hide or show, reorder, choose payment QR codes; delete a checklist item | – | – | ✓ | ✓ |
| Delete a service (one or many; kept when a request used it) | – | – | ✓ | ✓ |
| Activity log: manual clean-up of entries older than 90, 180 or 365 days (fresh confirm; never younger than 30 days) | – | – | ✓ | ✓ |
| Payment methods, Site content, File settings, Export | – | – | ✓ | ✓ |
| Activity log (view only) | – | ✓ | ✓ | ✓ |
| Admin users: table, invite, change role, turn off or on, reset 2-step login, resend invite | – | – | ✓ | ✓ |
| Invite, promote, demote or turn off an **owner** | – | – | – | ✓ |
| Security page (my own devices) | – | ✓ | ✓ | ✓ |

Staff cannot delete anything (requests, files, notes, services, checklist items, payment methods, accounts), cannot invite or create any account, and cannot see the Dashboard, Payment methods, Site content, File settings, Admin users or Export.

### Where access is checked (four places)

1. **Route protection** (`src/proxy.ts`): logged-out visitors go to `/login?next=...`.
2. **Every page, Server Action and route:** `guardPanelPage(action)`, `withPanel({ action })`, `requirePanel(action)` for the admin area, and `requireUser()`, `requireVerifiedUser()`, `requireRequestAccess()` for clients. A page check does not protect a Server Action, so each one checks again. A refused try is written to the activity log as `access.denied` (who, which action, where).
3. **Every service function** calls `assertCan(actor, action)` again, so a page or action cannot forget it.
4. **The database:**
   - Row Level Security policies use `private.can('...')` (a `security definer` helper in a private schema, so there is no recursion).
   - Our server connects as the database owner, so RLS does not apply to it. So **triggers** also check: the server tells the database who is acting (`app.actor_id`, see `src/server/db/actor.ts`), and the triggers refuse what that role may not do (staff verifying a payment, changing a fee, hiding a service, deleting anything; anyone changing their own role; an admin touching an owner). This is a safety net after the code checks.

Hiding a menu item is not security. If staff open a hidden address they see "Not allowed" and the try is logged.

### Main files
| File | What it does |
|---|---|
| `src/lib/permissions.ts` | The role table: `can`, `ROLES`, `landingPathForRole` |
| `src/server/auth/panel.ts`, `panel-core.ts` | `requirePanel`, `guardPanelPage`, `withPanel`, `checkPanel` (the order of checks) |
| `src/server/auth/session.ts`, `session-core.ts` | `getSession`, `requireUser`, `requireVerifiedUser`, `getViewer`, `withUserRls` |
| `src/server/auth/mfa-devices.ts`, `mfa-api.ts` | The authenticator devices of one person (add, remove, rules) |
| `src/server/services/accounts.ts` | The accounts table, invite, role change, turn off or on, reset 2-step login |
| `src/server/db/actor.ts` | `setActor`: tells the database who is acting |
| `src/app/auth/actions.ts` | login, register, resend, forgot, reset, sign out |
| `src/lib/validation/auth.ts` | The password rule and the form schemas |
| `src/lib/safe-next.ts` | Safe "go back to where you were" paths |

The checks in `checkPanel`, in order: a valid session → 2FA level (only while `ADMIN_REQUIRE_2FA` is not `false`) → the account exists and is on → the role is staff, admin or owner → no temporary password → no pending 2-step reset → the session is not older than a "sign out everywhere" → the role may do the action.

---

## 2. Set up Supabase for sign-in (you do this by hand)

Do these on your **test** Supabase project first. Then repeat on the real one.

1. **Authentication > Sign In / Providers > Email**
   - "Enable email provider": ON.
   - "Confirm email": **ON**. (A user cannot sign in before they open the link.)
   - "Allow new users to sign up": **ON**. (Before accounts it was OFF.)
   - Minimum password length: **12**. This must match `PASSWORD_MIN` in `src/lib/validation/auth.ts`.
   - Leaked password protection is a paid (Pro) feature. We do not have it. The app blocks a short list of common passwords instead.
2. **Authentication > URL Configuration**
   - Site URL: your site address, for example `https://your-site.vercel.app` (local: `http://localhost:3000`).
   - Redirect URLs: add the same address with `/**` at the end.
3. **Authentication > Emails > Templates.** Change two templates so the link goes to our `/auth/confirm` page:
   - **Confirm signup**: link =
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account`
   - **Reset password**: link =
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   - Write the link as a normal HTML link, for example:
     `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account">Confirm your email</a>`
   - Leave the **Invite user** template as it is (it is used for new staff and admins).
4. **Authentication > Emails > SMTP Settings** (custom SMTP with Brevo).
   - Why: Supabase's built-in email sends only to your own team addresses, about 2 emails per hour. That is not enough for real users.
   - In Brevo: open **SMTP & API**, copy the SMTP login and make an **SMTP key** (this is not the same as the API key).
   - In Supabase, fill in: Host `smtp-relay.brevo.com`, Port `587`, Username = the SMTP login shown in Brevo, Password = the SMTP key, Sender email = your verified Brevo sender, Sender name = `RG'S Bookkeeping`.
   - The Brevo free plan sends about 300 emails per day.
5. **Authentication > Rate Limits**: with custom SMTP the default is 30 emails per hour. Keep it at 30 or lower so you stay under Brevo's daily limit.
6. **Database**: apply the migrations (section 3) before you let anyone sign up.
7. TOTP 2FA is free and already available on every Supabase project (section 8).

Test it: create an account on `/register`, open the email, sign in, then try "Forgot your password?".

---

## 3. Apply the database migrations (you do this by hand)

The migration files are in the repo. **Nobody has run them on a live database yet.** Do this on your TEST project first. **I (the assistant) never run SQL on the live database.**

| File | What it does |
|---|---|
| `drizzle/0002_accounts_and_roles.sql` | Adds the `profiles` table and `requests.user_id` |
| `drizzle/0003_accounts_security.sql` | Sign-up trigger, the lock on the role column, the read-only rules for signed-in users, the storage rule |
| `drizzle/0004_service_fee_and_qr.sql` | Service fee and the payment QR codes per service |
| `drizzle/0005_admin_temp_password.sql` | `profiles.must_change_password` |
| `drizzle/0006_single_role.sql` | **One role column** (`user`, `staff`, `admin`, `owner`). Moves the data from `admin_profiles` into `profiles` and removes `admin_profiles`. Adds the `private` schema (`private.can`), the last-owner trigger on `profiles`, and the actor triggers. Marks every staff, admin and owner account as "needs two devices". |

### How the old accounts are mapped (0006)

| Today | Becomes |
|---|---|
| An admin with level `owner` (active or turned off) | `owner` (same on/off) |
| An admin with level `staff` (active or turned off) | `staff` (same on/off) |
| An admin that was removed earlier (role `user`) | `user` |
| An old "admin" with no admin record | `user` |
| Everybody else (clients) | `user` |

You make the developer an `admin` by hand afterwards (step 6 below). The real names are not in this public repository.

### Steps

1. **Back up first.** In the admin area open **Export** and download both CSV files. Keep them.
2. **Look first, change nothing.** In the Supabase SQL Editor run this and keep the answer. It only reads:
   ```sql
   select p.email, p.full_name, p.role as account_role, a.role as level, a.is_active
   from public.profiles p left join public.admin_profiles a on a.id = p.id
   where p.role = 'admin' or a.id is not null order by p.email;
   ```
   Check each row against the table above. If any account is not what you expect (for example an old test account), decide what it should become **before** you go on.
3. Put `DIRECT_DATABASE_URL` (the direct address, port 5432) in `.env.local`.
4. Run `pnpm db:migrate`. Then run `pnpm db:check`. It must say both addresses work.
5. Check the result in the SQL Editor:
   ```sql
   select role, is_active, count(*) from public.profiles group by 1, 2 order by 1, 2;
   select count(*) from public.profiles where role = 'owner' and is_active;   -- must be at least 1
   select policyname, roles from pg_policies where schemaname = 'public';       -- every row: {authenticated}
   select count(*) from public.profiles; select count(*) from auth.users;       -- the same number
   ```
6. Make the developer an admin (this works only while another active owner exists):
   ```sql
   update public.profiles set role = 'admin' where email = '<DEVELOPER EMAIL>';
   ```
7. If the 0003 migration printed a notice "Could not add the storage policy", add it by hand in the SQL Editor:

```sql
create policy client_files_read_own on storage.objects for select to authenticated
using (
  bucket_id = 'client-files'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
```

8. Sign in as each role and run the manual test list (section 9). Then repeat all steps on the live project.

**If something goes wrong:** restoring from the CSV export is not a full restore. Run the migration on a copy (a new Supabase project) first.

---

## 4. Your first owner account (you do this by hand)

Only for a brand new project (an old project already has its owner after the migration).

1. On the live site open `/register`, create an account with the owner email, and open the email link.
2. In the Supabase dashboard open **SQL Editor** and run this (change the email):

```sql
update public.profiles set role = 'owner'
  where id = (select id from auth.users where email = 'OWNER@EMAIL');
```

3. Sign out, sign in again at `/login`. You land on `/admin`.

(`pnpm db:seed` can also make the first owner: it creates the login and the owner profile together. Use a real owner email for production.)

**Managing accounts later:** in **Settings > Admin users** (owner and admin only). See section 10.

---

## 5. Test it on your computer (no Supabase needed)

Run the local test database and the site (`pnpm dev:db` in one terminal, `pnpm dev` in another, see the README). In `.env.local` use the local database address and add:

```
DEV_USER_BYPASS_EMAILS=zolb-test+usera@example.com
DEV_ADMIN_BYPASS_EMAIL=zolb-test+owner@example.com
```

- Open `/login`. A yellow box lists the test users; click one to sign in as that user without a password.
- `/api/dev-login?as=admin` uses the development admin. `/api/dev-login?logout=1` is a signed-out visitor.
- These switches work **only** when `NODE_ENV` is `development` (never in a build or on Vercel). The route answers 404 anywhere else, and only emails like `zolb-test+...@example.com` are accepted. Tests prove it.
- In this mode the fresh confirm code is `000000`. The Security page says "Not available here" (there is no Supabase).
- Browser tests: `pnpm test:e2e` (needs the local database; the tests refuse to run on any other database). The browser tests make local test accounts with the role `staff` or `admin`, clearly marked `zolb-test+...@example.com`, and remove them again.

---

## 6. Environment variables for accounts

| Variable | Where | What |
|---|---|---|
| `ADMIN_REQUIRE_2FA` | server only | Only the exact word `false` turns 2-step login off for staff, admin and owner. Missing, empty, `true`, `0`, `no`, `off` or anything else = required. **Set it to `true` (or remove it) on the live site.** It skips only the 2FA code step. It never skips a role check, and it never skips the fresh confirm (section 7). |
| `DEV_USER_BYPASS_EMAILS` | local `.env.local` only | Comma list of test emails (`zolb-test+...@example.com`) for the development test login. Leave empty on every real server. |
| `DEV_ADMIN_BYPASS_EMAIL` | local `.env.local` only | The development admin account. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | server (the first two also browser) | Needed for sign in. The secret key (server only, never in the browser) is also used to turn accounts off, to remove another person's authenticator devices, and to delete an account's login. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | browser / server | Spam check on sign in, sign up, resend and reset. |

No new variable was added for roles. The email settings (Brevo SMTP host, login and key) go **into the Supabase dashboard**, not into our variables.

---

## 7. The fresh confirm (before a risky change)

Risky changes (payment methods, accounts, deleting client data) need a **fresh confirm** typed in the last 5 minutes. It is always the confirm of **the person making the change**, never of the other account. The dialog says: "Enter the 6-digit code from YOUR authenticator app."

- A person with an authenticator: the 6-digit code from any of their devices.
- A person with **no authenticator yet** (possible only while `ADMIN_REQUIRE_2FA` is `false`): their own account password. The dialog says so.
- Wrong tries: 5 per 15 minutes.
- With the flag `false` the confirm is **still asked**. (Before this work, the flag off skipped it completely.)

---

## 8. Admin 2-step login (staff, admin and owner)

When you are ready: set `ADMIN_REQUIRE_2FA=true` in Vercel (or remove the line), redeploy, and sign in. The red banner disappears.

- **Setup has two steps and two devices.** First an authenticator app, then a backup device (the page says you can scan the same QR code on two phones). Each device gets a name. The admin area stays closed until two devices exist. This is true at the first sign in and **after a reset by another person**.
- At every sign in a code from **any** of your devices is accepted.
- **Security page** (`/admin/security`, a link in the header, for everyone who opens the admin area): your devices (name and date added), add a backup device, remove a device. Removing needs a code from a **different** device. The last device can never be removed. Adding a device needs the higher level (a code typed at sign in), so a password alone cannot add an attacker's device.
- **Forgot password does not bring back a lost authenticator.** Regular clients have no authenticator: they use Forgot password or Google.
- **No email code, PIN or recovery code can skip 2-step login.** That would make it useless. A lost phone is fixed by a second person (below) or, as a last resort, by the developer in the Supabase dashboard (`docs/RECOVERY.md`).

### Reset 2-step login (by another person)
Settings > Admin users > Actions > **Reset 2-step login**.

- Who: owner and admin can reset staff, and each other. Nobody can reset themselves.
- The person doing it enters the code of **their own** authenticator (or their password, section 7) and types the other person's full email.
- The system removes all devices of the other person (server only, with the Supabase secret key), signs them out everywhere, writes the activity log (`account.2fa_reset`), and emails them. **If the person is an owner, every active owner gets an email too.**
- At the next sign in the person must set up a new authenticator and a backup device before they reach the admin area.
- With `ADMIN_REQUIRE_2FA=false` the reset still removes the devices and signs the person out. The setup is not forced until the flag is on.

## 9. Manual test list (on your Supabase TEST project)

Do these once before real clients use the site. Tick them in `docs/SECURITY_CHECKLIST.md`.

Accounts and email
- [ ] Create an account. The email arrives (Brevo). You cannot sign in before opening the link. After the link you are signed in.
- [ ] "Send the link again" works, and stops after 3 tries in an hour.
- [ ] Forgot password: the email arrives, the link opens "Choose a new password", the new password works, the old one does not. Using the same link twice shows "This link has ended".
- [ ] A wrong password and a wrong email show the same message.

Access control (clients)
- [ ] **User A opens user B's request by changing the address** (`/account/requests/<B's id>` and `/request/<B's id>/documents`): "not found" / "expired" page, no data.
- [ ] **Direct access to a private file path** with no login must fail. With a signed-in user's token for another folder it must fail too.
- [ ] **A client reaches `/admin`:** "Not allowed" page.
- [ ] **A client tries to make themselves admin:** (a) send `update profiles set role='admin'` with the public key and your own login token through the Supabase API: it must be refused; (b) the profile form has no role field. `select role from profiles where email = '<user>'` must still say `user`.
- [ ] A visitor who opens `/account` goes to `/login?next=/account` and comes back after sign in.
- [ ] An expired session shows "Your session ended" and returns to the same page after sign in.

Staff (sign in as a staff account)
- [ ] The menu shows only **Requests, Services, Activity** (and the Security link in the header). The header says **Staff**. After sign in you land on Requests.
- [ ] Type the address of **Payment methods**, **Admin users**, **Export**, **Site content**, **File settings** and the **Dashboard** (`/admin`): each shows "Not allowed", and each try is in the Activity page as `access.denied`.
- [ ] On a request: staff can change the status, add a note and open a client document (it is logged as `file.opened`). There is **no** "Mark payment verified" button.
- [ ] Replay "mark payment verified" or "reject payment" directly (browser tools, same form) as staff: refused and logged.
- [ ] Replay "delete checklist item", "erase client data" or any delete: refused and logged.
- [ ] On a service: staff can change name, description and checklist words, and add a service (it starts hidden, no fee). There is no fee box, no On/Off, no payment QR choice, no Delete. Sending a fee or "show" directly is refused.
- [ ] Staff cannot invite or create any account.

Owner and admin
- [ ] **An admin tries to change, demote or turn off the owner** (Admin users): refused ("Only an owner ...").
- [ ] **Changing your own role** or turning yourself off: the row has no actions, and a direct call is refused.
- [ ] **Removing the last owner:** make one owner turn the other owner off, then try to demote or turn off the last one with a direct call: refused (database).
- [ ] An owner can make an owner, invite an owner, and demote one while another owner stays.
- [ ] "Change role" is **one** dialog with one code box: "Enter the 6-digit code from YOUR authenticator app." The person gets an email. The change is in the activity log (who, whom, old and new role, time).
- [ ] "Turn account off": the person is signed out everywhere, cannot sign in (also not with the right password), gets an email. "Turn on" lets them in again. Works for a client too.
- [ ] Invite by email, and invite with a temporary password: the person must choose their own password at the first sign in.
- [ ] Accounts table: search by name and email, role filter, status filter, rows per page (10, 25, 50), next and previous page. The web address keeps all of them (reload and go back). On a 390 px wide phone the table is stacked cards.

2-step login
- [ ] **Admin sign in works without 2FA while the flag is "false"**, and the red banner "2-step login is OFF..." shows on every admin page.
- [ ] With the flag `false` and no authenticator, a risky change asks for **your account password**, not a code.
- [ ] With the flag `true`: a new account is sent to setup, must add an authenticator **and** a backup device, then reaches the admin area. A code from the backup device works at sign in.
- [ ] Security page: the list shows both devices. Remove one with a code from the OTHER device: it works. Try with a code from the same device: refused. Try to remove the last device: refused.
- [ ] **Reset 2-step login by an owner** (on a staff member and on an admin) and **by an admin** (on a staff member and on an owner): you must type the other person's email; the person is signed out everywhere; they and (for an owner) every owner get an email; the activity log shows it; the person must set up two new devices at the next sign in. A reset on yourself is refused.

Header and general
- [ ] Header buttons: visitor = Sign in; client = My requests + Sign out; staff, admin, owner = Admin + Sign out. Check desktop and a 390 px wide phone.
- [ ] "Sign out" from a public page, from `/account` and from `/admin`: you land on the home page with "You have been signed out."
- [ ] **Press the browser Back button after sign out** from each of those: private pages and data must not show again.

Privacy
- [ ] "Download my data" gives only your own data.
- [ ] "Delete my account" is refused while a request is open. After the request is completed it deletes the account, the documents disappear from storage, and the old request shows "Deleted client" to the admin. An account that can open the admin area cannot be deleted this way.

---

## 10. Settings > Admin users

Only owner and admin (`accounts.view`). Staff do not see it.

- **A table** (stacked cards on a phone). Columns: Name, Email, Role, Status (Active, Turned off, Invited with temporary password, Email not verified), 2-step login (On or Off for staff, admin and owner), Joined, Actions.
- **Toolbar:** search by name or email, filter by role and status, rows per page (10, 25, 50). Page, search and filters are in the web address (`?q=&role=&status=&per=&page=`). The search, filters and paging run on the server.
- **Invite** button (owner and admin): the role is staff or admin; only an owner sees owner. Two ways: an invitation email, or a temporary password (never saved or logged, the person must change it at the first sign in).
- **Actions menu:** Change role, Reset 2-step login (staff, admin, owner accounts only), Turn account off or on, Resend invite (only when the email is not verified). **There is no delete.** A row you may not touch shows "–"; your own row never has actions.
- **Change role:** one dialog, choose the role, enter the code once ("Enter the 6-digit code from YOUR authenticator app.").
- **Turn off:** the person cannot sign in (also blocked at Supabase), is signed out everywhere, and keeps their data. It works for clients too.
- **Must change password:** an account made with a temporary password has `profiles.must_change_password = true`. At the first sign in the person goes to `/account/change-password`. The admin area refuses the account until the password is changed.
- Every change is written to the activity log, and the person gets an email (`src/server/email/notify.ts`, `notifyAccountChange`).
- Tests: `tests/unit/accounts.test.ts`, `accounts-reset.test.ts`, `roles-db.test.ts`, `mfa-devices.test.ts`, and the browser tests `tests/e2e/accounts-table.spec.ts`, `roles-security.spec.ts`.

## 11. Sign in with Google (optional)

Clients can sign in or sign up with a Google account (Supabase Auth, Google provider). Setup steps for the owner:
`docs/GOOGLE_SIGN_IN_SETUP.md`. The button shows only when `GOOGLE_SIGNIN_ENABLED=true`.

- Flow: link `/auth/google` (rate limited, asks Supabase for the Google address, PKCE cookie) -> Google -> `/auth/callback`
  (`exchangeCodeForSession`, `ensureProfile`, log row `auth.login.success` with `provider: google`).
- The role still comes only from `profiles`. A new Google person gets role `user` from the sign-up trigger.
- **Staff, admin and owner accounts cannot use Google.** If the profile role is staff, admin or owner, the callback logs a failed login, signs the person out and
  sends them to `/login?reason=google-admin`. Reason: the admin login has the spam check, rate limits and the 2-step code,
  and Google would skip them.
- Same email as an existing account: Supabase joins the Google login to that account (Google verifies the email).
- Rules in code: `src/lib/google-signin.ts` (tested in `src/lib/google-signin.test.ts`).
