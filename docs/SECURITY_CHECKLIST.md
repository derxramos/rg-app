# SECURITY_CHECKLIST.md

Every item from `docs/SECURITY_AND_PRIVACY.md`, with its status and the proof. Checked at the end of Phase 7 (2026-11-06).

**Legend**

- ✅ **Verified.** A test or a run on the developer's computer proves it. The proof is named.
- 🟡 **Built, but not verified live.** The code and its tests exist, but it needs your real accounts (Supabase, Brevo, Cloudflare, Netlify) to prove it.
- ⬜ **Your action.** A setting in a dashboard or a decision only the owner can make.

"Unit tests" means `pnpm test` (321 tests, includes a real Postgres in memory). "E2E" means the Playwright tests in a real Chrome.

---

## 1. Threats

### T1: QR swap

| Item | Status | Proof |
|---|---|---|
| Only the **owner** role can edit payment methods | ✅ | Unit: `admin-services.test.ts` (staff refused on every payment method action); source test `admin-actions-guard.test.ts` |
| Changing the QR, account name or account number needs a **fresh 2FA code** (last 5 minutes) | ✅ | Unit: `admin-services.test.ts`, `admin-auth.test.ts` (cookie rules). E2E: `admin.spec.ts` (wrong code refused, right code saves). Real authenticator app: 🟡 |
| Every change is logged with before and after | ✅ | Unit: app row `payment_method.qr_changed` and the database trigger row `payment_method.row_changed`, with the admin id. E2E: both rows appear on the activity page |
| **Alert email to the owner** | 🟡 | Template and sending are unit tested with a fake Brevo. A real email was not sent |
| New QR images get a new random file name | ✅ | Code in `settings/payments/actions.ts` (`qr/<uuid>.<ext>`). Uploading to the real bucket: 🟡 |
| Old QR file kept for 30 days | 🟡 | The old file is **kept forever** (nothing deletes QR files). Enough for comparing. No cleanup for QR files yet |
| Each payment saves a `method_snapshot` | ✅ | Unit: `payments.test.ts`. E2E: `payment.spec.ts` reads the snapshot |
| Payment page shows the account name **large**, with "Check this name before you pay" | ✅ | E2E: `payment.spec.ts` |
| Dashboard shows "Payment methods last changed" | ✅ | Unit: `getDashboard`. E2E: `admin.spec.ts` |

### T2: Someone opens client files without permission

| Item | Status | Proof |
|---|---|---|
| Bucket is **private** | 🟡 | `pnpm storage:setup` creates it private. ⬜ Open the Supabase dashboard and check that `client-files` is **not** public |
| Only the server reads files. Admin gets a **60 second signed link** after `requireAdmin()` | ✅ | Unit: `getFileLink` asks for 60 seconds. E2E: dev route needs an admin. Real signed links: 🟡 |
| Each file open is logged | ✅ | Unit: `admin-services.test.ts` (`file.opened`) |
| Tracking page never shows files or file names | ✅ | Unit: `tracking.test.ts` (the view has exactly 8 fields, no file names). E2E: `tracking.spec.ts` checks the page HTML |
| File paths use random ids | ✅ | Unit: `files.test.ts` (path pattern, original name not in the path) |
| Files auto-deleted N days after Completed or Cancelled | ✅ | Unit: `cleanup.test.ts`. The scheduled job running live on GitHub: 🟡 |

### T3: Guessing tracking codes

| Item | Status | Proof |
|---|---|---|
| Code is `RG-` plus 8 characters from 31 (no look-alikes) | ✅ | Unit: `request-core.test.ts` (500 codes, no 0, O, 1, I, L) |
| The last 4 phone digits are also needed | ✅ | Unit and E2E: `tracking` tests |
| Rate limits: 10 per 15 minutes per visitor, lock after 5 wrong tries | ✅ | Unit: `tracking.test.ts` (5 wrong tries, 6th refused even with the right digits, exactly 15 minutes). E2E: `tracking.spec.ts` |
| Turnstile on the tracking form | ✅ | Run in production mode with Cloudflare's test keys: the widget loads under the CSP, the server check passes (request and payment flows). Real keys: 🟡 |
| Same message for every failure | ✅ | Unit and E2E: wrong code and wrong digits give the same text |
| Very little data even after success | ✅ | See T2 |

### T4: Spam on public forms

| Item | Status | Proof |
|---|---|---|
| Turnstile on contact, request step 1, tracking. **The server always calls Siteverify** | ✅ | Unit: `request-core.test.ts` (fake Cloudflare: refuses bad, missing and failed tokens; refuses everything in production with no secret). Production run with test keys |
| Rate limits per IP on every public action | ✅ | Unit: `rate-limit` tests. Code: draft 5/h, contact 5/h, track 10/15 min, upload 60/h, pay 20/h |
| Honeypot field | 🟡 | In the request and contact forms. Not covered by a browser test |
| Unsent drafts deleted after 7 days with their files | ✅ | Unit: `cleanup.test.ts` |
| Length limits on every text field | ✅ | Unit: Zod schemas (`contact.test.ts`, `request-core.test.ts`, `settings.test.ts`) and database checks (`db-migrations.test.ts`) |

### T5: Upload abuse

| Item | Status | Proof |
|---|---|---|
| Real type check by magic bytes (JPG, PNG, PDF only) | ✅ | Unit: `files.test.ts`, `request-core.test.ts`. E2E: a program renamed to .jpg is refused |
| Max size and max count (settings) | ✅ | Unit: `files.test.ts` (and the settings change the limit) |
| Upload only with a valid draft or tracking cookie for that request | ✅ | Unit: `request-core.test.ts`. E2E: another browser gets 403 |
| Rate limit uploads | ✅ | Code in `api/upload/route.ts`. Not covered by a test that hits the limit |
| Hard stop at 95 percent storage | ✅ | Unit: `files.test.ts` |
| Files never shown inline in our site | ✅ | Admin links open in a new tab through the signed link |
| Original file names cleaned, only stored in the database | ✅ | Unit: `cleanFileName` tests |
| PDFs are not rendered in our pages | ✅ | No PDF viewer exists in the code |

### T6: Admin account takeover

| Item | Status | Proof |
|---|---|---|
| Sessions need **AAL2** (password and 2FA code) on every admin page, action and route | ✅ | Unit: `admin-auth.test.ts` (logged out, password only, not an admin, turned off), source test that every admin action calls `withAdmin` or `requireAdmin`. The real Supabase login: 🟡 |
| Password of 12 or more characters, leaked password protection | ⬜ | Supabase dashboard > Authentication. The app cannot set this |
| **No public sign-up** | ⬜ | Supabase dashboard > Authentication > turn **off** sign-ups. Admins are invited |
| Login rate limit and log of all logins | ✅ | Code in `(auth)/actions.ts` (5 per 15 minutes, logged). Real login: 🟡 |
| Fresh 2FA for the riskiest actions | ✅ | See T1. Also for admin users and "delete client data" |
| Owner can turn off a staff account at once | ✅ | Unit: an inactive profile is refused on the next request |
| Backup TOTP device | 🟡 | Screen built ("Add a backup device"). Needs the real Supabase |
| Short admin session (for example 8 hours) | ⬜ | A Supabase setting. **Session time limits are a paid-plan feature**, so on the free plan the session follows Supabase's default |

### T7: Fake payment receipts

| Item | Status | Proof |
|---|---|---|
| OCR only helps, admin must check the real account | ✅ | E2E: the strong warning is shown above Verify |
| Admin must tick "I found this payment in our account" | ✅ | Unit and E2E |
| Reference unique per payment method | ✅ | Unit: `db-migrations.test.ts`, `payments.test.ts`. E2E: clear message |
| Entry method and first OCR values saved | ✅ | Unit and E2E (admin sees "OCR first read") |

### T8: Common web attacks

| Item | Status | Proof |
|---|---|---|
| SQL injection: parameters only | ✅ | Drizzle everywhere. The one search with a text pattern escapes `%` and `_` (unit test) |
| XSS: React escapes. Owner Markdown shows no raw HTML | ✅ | E2E on the service page (script tag and `javascript:` link not shown). Emails escape client text (unit test) |
| Content Security Policy | ✅ | Unit: `security-headers.test.ts`. E2E: no violations on 13 pages. Production build: all headers present, no `unsafe-eval`. **Known limit:** scripts allow `'unsafe-inline'` (see PROGRESS.md decision) |
| CSRF: Server Actions check the origin. Cookies SameSite Lax, httpOnly, Secure | ✅ | Next.js built-in origin check. Cookie options in `request-access.ts` and `admin.ts`. A browser test of a forged post: not done |
| Clickjacking: `frame-ancestors 'none'` and `X-Frame-Options` | ✅ | E2E: `security.spec.ts` |
| Secrets only in environment variables. `server-only` on server code. `.env*` ignored | ✅ | Unit: `project-rules.test.ts` (every server file, no secret `NEXT_PUBLIC_` names, `.env.example` complete). Search of the code found no keys |
| GitHub secret scanning | ⬜ | GitHub > Settings > Code security > turn on secret scanning |
| Dependencies: audit and Dependabot | 🟡 | `pnpm audit` job in CI and `dependabot.yml` are written. They have not run on GitHub yet. Install Next.js security patches quickly |
| CSV injection | ✅ | Unit and E2E: `=SUM(1+1)` becomes `'=SUM(1+1)` |

### T9: Database loss

| Item | Status | Proof |
|---|---|---|
| Weekly CSV export reminder | ✅ | Dashboard and Export page text |
| Optional weekly `pg_dump` | 🟡 | `backup.yml` is written, OFF by default, private repo only. Never run |
| Migrations in Git | ✅ | `drizzle/` |

### T10: Free-plan outages

| Item | Status | Proof |
|---|---|---|
| Keep-alive every 3 days | ✅ / 🟡 | The script runs on the test database. The schedule on GitHub has not run |
| Few production deploys | ⬜ | Use deploy previews. Check Netlify credits weekly |
| Dashboard warnings for old jobs and storage | ✅ | Unit and E2E |
| Error page shows Messenger and Viber | ✅ | E2E on the error screen (Phase 2) |

---

## 2. Data Privacy Act basics

| Idea | Status | Proof or what is missing |
|---|---|---|
| **Consent**: unticked box, link to the notice, date and version saved | ✅ | Unit and E2E |
| **Transparency**: privacy notice page | 🟡 | Built. The text is a **draft**. ⬜ The owner must fill the `[brackets]` and have it reviewed |
| **Collect only what is needed**; the receipt picture is never sent | ✅ | E2E: no request contains the picture bytes |
| **Limited keeping**: files after N days, drafts after 7 days | ✅ | Unit: `cleanup.test.ts`. ⬜ Owner decides how long request records are kept |
| **Access control**: every request and file checked on the server | ✅ | Unit and source tests |
| **Audit log** | ✅ | Unit tests for each logged action |
| **Security**: HTTPS, private storage, 2FA, rate limits | 🟡 | HSTS header ✅. HTTPS, private bucket and 2FA need the live setup |
| **Data subject rights**: copy, fix, delete | 🟡 | **Delete client data** is built (owner only, fresh 2FA, typed DELETE, logged, unit tested). A "copy of my data" and "fix my data" are done by hand: use the request page and the CSV export |
| **Breach response**: steps in `SECURITY_AND_PRIVACY.md` section 3 | ⬜ | Owner reads and agrees. Tell the NPC and clients when the law requires it |
| **Data location**: Supabase region near the Philippines | ⬜ | Choose the region when you create the project. Write it in the privacy notice |

---

## 3. What is still open before real clients

1. Everything marked 🟡 needs one pass with the real accounts (Supabase, Brevo, Cloudflare Turnstile, Netlify, GitHub).
2. Everything marked ⬜ is a dashboard setting or a decision.
3. The privacy notice text must be finished and reviewed.
4. The owner completes one real test request on her phone (Phase 7 goal), including a real email and a real payment check.
