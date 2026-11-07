# AUTH_AND_ROLES.md

How accounts, roles and sign-in work in this app. Plain English on purpose.

> Status: the accounts feature is built (branch `feat/auth-roles`). Nothing here has been run on a live Supabase project yet.
> Sections 3 to 6 are steps you do by hand. Section 8 is the last phase (2-step login on).

---

## 1. The idea

- One sign-in page for everyone: `/login`. Supabase Auth, email and password.
- Two roles, in the `profiles` table: `user` (default) and `admin`.
- An admin ALSO has a row in `admin_profiles` (level `owner` or `staff`, and an on/off switch).
- `requireAdmin()` needs BOTH: `profiles.role = 'admin'` and an active `admin_profiles` row. Two records must agree.
- The role is always read from the database on the server. It is never taken from the browser or from the token.
- A new sign-up is always `user`. A database trigger does this. Nobody can change their own role (two locks in the database, see `docs/DATABASE.md` section 1).
- Anyone can still follow a request with the tracking code and the last 4 digits of the phone (`/track`). Signed-in users also see "My requests".

### Where access is checked (three places)
1. **Route protection** (`src/proxy.ts`): logged-out visitors go to `/login?next=...`. It also sends `Cache-Control: no-store`.
2. **Every page, Server Action and route**: `requireUser()`, `requireVerifiedUser()`, `requireAdmin()`, `requireRequestAccess()`. A page check does not protect a Server Action, so each one checks again.
3. **The database** (Row Level Security): a user can only read their own rows.

### Main files
| File | What it does |
|---|---|
| `src/server/auth/session.ts` | `getSession`, `requireUser`, `requireVerifiedUser`, `getViewer`, `guardUserPage`, `withUser`, `withUserRls` |
| `src/server/auth/session-core.ts` | The testable core, the dev test login rules, `runAsUser` (Row Level Security) |
| `src/server/auth/admin.ts`, `admin-core.ts` | `requireAdmin`, `checkAdmin` |
| `src/app/auth/actions.ts` | login, register, resend, forgot, reset, sign out |
| `src/app/auth/confirm/route.ts` | The link in the verify and reset emails |
| `src/lib/validation/auth.ts` | The password rule and the form schemas |
| `src/lib/safe-next.ts` | Safe "go back to where you were" paths |

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
   - Leave the **Invite user** template as it is (it is used for new admins).
4. **Authentication > Emails > SMTP Settings** (custom SMTP with Brevo).
   - Why: Supabase's built-in email sends only to your own team addresses, about 2 emails per hour. That is not enough for real users.
   - In Brevo: open **SMTP & API**, copy the SMTP login and make an **SMTP key** (this is not the same as the API key).
   - In Supabase, fill in: Host `smtp-relay.brevo.com`, Port `587`, Username = the SMTP login shown in Brevo, Password = the SMTP key, Sender email = your verified Brevo sender, Sender name = `RG'S Bookkeeping`.
   - The Brevo free plan sends about 300 emails per day.
5. **Authentication > Rate Limits**: with custom SMTP the default is 30 emails per hour. Keep it at 30 or lower so you stay under Brevo's daily limit.
6. **Database**: apply the migrations (section 3) before you let anyone sign up.
7. Turn on TOTP 2FA later (Phase 9). It is free and already available on every Supabase project.

Test it: create an account on `/register`, open the email, sign in, then try "Forgot your password?".

---

## 3. Apply the database migrations (you do this by hand)

The migration files are in the repo. **Nobody has run them on a live database yet.** Do this on your TEST project first.

| File | What it does |
|---|---|
| `drizzle/0002_accounts_and_roles.sql` | Adds the `profiles` table, the `app_role` type and `requests.user_id` |
| `drizzle/0003_accounts_security.sql` | Sign-up trigger (every new account is a `user`), the lock on the role column, `is_admin()`, the read-only rules for signed-in users, the private-column rights, the storage rule, and fills in profiles for people who already exist |

Steps:
1. **Back up first.** In the admin area open **Export** and download both CSV files. Keep them.
2. Put `DIRECT_DATABASE_URL` (the direct address, port 5432) in `.env.local`.
3. Run `pnpm db:migrate`.
4. Run `pnpm db:check`. It must say both addresses work.
5. In the Supabase SQL Editor run: `select count(*) from profiles;` and `select count(*) from auth.users;`. The two numbers must be the same.
6. In the SQL Editor run: `select policyname, roles from pg_policies where schemaname = 'public';`. Every row must show `{authenticated}` only.
7. If the migration printed a notice "Could not add the storage policy", add it by hand in the SQL Editor:

```sql
create policy client_files_read_own on storage.objects for select to authenticated
using (
  bucket_id = 'client-files'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
```

**What happens to old guest requests?** They keep `user_id = null`. Admins see them as before. The tracking code + last 4 digits still works for them. They do **not** show in anyone's "My requests" (nobody can claim a request by email alone, because that would be unsafe). Old drafts expire after 7 days by the normal cleanup.

**If something goes wrong:** restore from the CSV export is not a full restore. Run the migration on a copy (a new Supabase project) first.

---

## 4. Your first admin account (you do this by hand)

1. On the live site open `/register`, create an account with the owner email, and open the email link.
2. In the Supabase dashboard open **SQL Editor** and run this (change the two values):

```sql
begin;
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'OWNER@EMAIL');
insert into public.admin_profiles (id, full_name, email, role)
  select id, 'Owner Name', email, 'owner' from auth.users where email = 'OWNER@EMAIL'
  on conflict (id) do update set role = 'owner', is_active = true;
commit;
```

3. Sign out, sign in again at `/login`. You land on `/admin`.

(`pnpm db:seed` can also make the first owner: it creates the login, the `admin_profiles` row and the admin profile together. Use a real owner email for production.)

**Managing admins later:** only an **owner** can do this, in **Settings > Admin users**: "Make an existing account an admin", "Remove admin", "Turn off", "Make staff / Make owner", or invite by email. Each change is written to the activity log (`role.changed`, `admin.invited`, `admin.updated`). While 2FA is on, each one also needs a fresh 6-digit code. The last active owner can never be removed.

Note: an invited admin gets Supabase's invite email. They set their password with "Forgot your password?" on `/login`.

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
- Browser tests: `pnpm test:e2e` (needs the local database; the tests refuse to run on any other database).

---

## 6. Manual test list (on your Supabase TEST project)

Do these once before real clients use the site. Tick them in `docs/SECURITY_CHECKLIST.md`.

Accounts and email
- [ ] Create an account. The email arrives (Brevo). You cannot sign in before opening the link. After the link you are signed in.
- [ ] "Send the link again" works, and stops after 3 tries in an hour.
- [ ] Forgot password: the email arrives, the link opens "Choose a new password", the new password works, the old one does not. Using the same link twice shows "This link has ended".
- [ ] A wrong password and a wrong email show the same message.

Access control
- [ ] **User A opens user B's request by changing the address** (`/account/requests/<B's id>` and `/request/<B's id>/documents`): "not found" / "expired" page, no data.
- [ ] **Direct access to a private file path:** try `https://<project>.supabase.co/storage/v1/object/public/client-files/users/<id>/requests/<id>/<file>` (public URL) with no login. It must fail. With a signed-in user's token for another folder it must fail too.
- [ ] **A user reaches `/admin`:** "Not allowed" page.
- [ ] **A user tries to make themselves admin:** (a) use the browser tools to send `update profiles set role='admin'` with the public key and your own login token through the Supabase API: it must be refused; (b) the profile form has no role field. In SQL Editor `select role from profiles where email = '<user>'` must still say `user`.
- [ ] A visitor who opens `/account` goes to `/login?next=/account` and comes back after sign in.
- [ ] An expired session shows "Your session ended" and returns to the same page after sign in.

Admin and the header
- [ ] **Admin sign in works without 2FA while the flag is "false"**, and the red banner "2-step login is OFF..." shows on every admin page.
- [ ] Header buttons: visitor = Sign in; user = My requests + Sign out; admin = Admin + Sign out. Check desktop and a 390 px wide phone.
- [ ] "Sign out" from a public page, from `/account` and from `/admin`: you land on the home page with "You have been signed out."
- [ ] **Press the browser Back button after sign out** from each of those: private pages and data must not show again (you are sent to the login page).
- [ ] Owner: "Make admin" and "Remove admin" work and appear in the activity log.

Privacy
- [ ] "Download my data" gives only your own data.
- [ ] "Delete my account" is refused while a request is open. After the request is completed it deletes the account, the documents disappear from storage, and the old request shows "Deleted client" to the admin.

---

## 7. Environment variables for accounts

| Variable | Where | What |
|---|---|---|
| `ADMIN_REQUIRE_2FA` | server only | Only the exact word `false` turns admin 2-step login off. Missing, empty, `true`, `0`, `no`, `off` or anything else = required. **Set it to `true` (or remove it) on the live site.** |
| `DEV_USER_BYPASS_EMAILS` | local `.env.local` only | Comma list of test emails (`zolb-test+...@example.com`) for the development test login. Leave empty on every real server. |
| `DEV_ADMIN_BYPASS_EMAIL` | local `.env.local` only | The development admin (already existed). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | server (the first two also browser) | Needed for sign in. The secret key is also used to delete an account's login. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | browser / server | Spam check on sign in, sign up, resend and reset. |

The email settings (Brevo SMTP host, login and key) go **into the Supabase dashboard**, not into our variables.

---

## 8. Turning on admin 2-step login (Phase 9)

When you are ready: set `ADMIN_REQUIRE_2FA=true` in Vercel (or remove the line), redeploy, and sign in as an admin. You are sent to `/admin/mfa/setup` to scan a QR code with an authenticator app, then asked for a code at every sign in. Fresh codes are asked again for risky actions. TOTP is free on Supabase. The red banner disappears. If you lose the phone, another owner can use "Turn off" / "Remove admin" and you can be invited again, or an owner can remove the factor in the Supabase dashboard (Authentication > Users).
