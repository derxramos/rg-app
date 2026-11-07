# AUTH_AND_ROLES.md

How accounts, roles and sign-in work in this app. Plain English on purpose.

> Status: written in steps while the accounts feature is built (branch `feat/auth-roles`).
> Sections 1 and 2 are done. Sections 3 to 6 are added in later phases (see PROGRESS.md).

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
