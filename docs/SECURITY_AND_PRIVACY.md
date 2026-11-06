# SECURITY_AND_PRIVACY.md

Threats, how we stop them, and Data Privacy Act basics.

Note: I am not a lawyer. This plan follows the basic ideas of the Philippine Data Privacy Act of 2012 (RA 10173). The owner should check the privacy notice text and any registration duty with the National Privacy Commission (NPC) or a lawyer.

---

## 1. Threats and fixes

### T1 — QR swap (attacker changes the payment QR to their own account)
How it could happen: stolen admin password, stolen session, or a bug that lets someone edit payment methods.

Fixes:
- Only the **owner** role can edit payment methods.
- Changing QR image, account name, or account number needs a **fresh 2FA code** (typed in the last 5 minutes).
- Every change is saved in `activity_log` with before/after values, and an **alert email** is sent to the owner right away.
- New QR images get a new file name. The old file is kept for 30 days so we can compare.
- Each payment saves a `method_snapshot` (account details at the moment of payment), so we can see which clients were affected.
- The payment page shows the **account name in large text** with "Check this name before you pay."
- Dashboard shows "Payment methods last changed: [date] by [name]".

### T2 — Someone opens client files without permission
Fixes:
- Bucket is **private**. No public URLs.
- Only the server (secret key) can read files. Admin gets a **signed link that works 60 seconds**, after `requireAdmin()`.
- Each file open is logged.
- Tracking page never shows files or file names.
- File paths use random ids, so they cannot be guessed.
- Files are auto-deleted N days after Completed/Cancelled.

### T3 — Guessing tracking codes
Fixes:
- Code = `RG-` + 8 characters from a 31-character alphabet with no look-alikes (no 0/O, 1/I/L). That is about 850 billion combinations.
- Code alone is not enough: the last 4 phone digits are also needed.
- Rate limits: per IP (10 tries per 15 min) and per code (5 wrong tries → locked 15 min).
- Turnstile on the tracking form.
- Same error message for every failure.
- Even with success, the page shows very little data (status, timeline, message).

### T4 — Spam on public forms
Fixes:
- Turnstile on contact form, request step 1, and tracking form. **Server always calls Siteverify.** Tokens are used once.
- Rate limits per IP on every public action.
- A hidden "honeypot" field (bots fill it, humans do not).
- Draft requests that are never submitted are deleted after 7 days with their files.
- Length limits on every text field (Zod).

### T5 — Upload abuse (huge files, malware, filling storage)
Fixes:
- Real type check by magic bytes on the server. Only JPG, PNG, PDF.
- Max size per file (default 3 MB) and max files per request (default 15).
- Upload only with a valid draft/tracking cookie for that request.
- Rate limit uploads per request and per IP.
- Hard stop when storage is at 95% (uploads refused with a friendly message; owner alerted).
- Files are never shown inline in our site; admin opens them via signed link in a new tab.
- Original file names are cleaned and stored only in the database, never used as paths.
- PDF files can contain scripts: we do not render PDFs in our pages. The admin's browser opens them in its own viewer.

### T6 — Admin account takeover
Fixes:
- Strong password (12+ chars), required TOTP 2FA, sessions at AAL2 for all admin pages.
- No public sign-up. Owner invites staff.
- Login rate limit and log of all logins.
- Fresh 2FA code for the most risky actions (payment methods, admin users).
- Owner can turn off a staff account at once.
- Backup TOTP device instead of recovery codes (Supabase does not give recovery codes).
- Short admin session (for example 8 hours, then log in again).

### T7 — Fake payment receipts
Fixes:
- OCR is only a helper. The admin screen says clearly to **check each payment in the real GCash/Maya/BDO account**.
- Admin must tick "I found this payment in our account" before verifying.
- Reference number must be unique per payment method (database unique index).
- We save how the values were entered (OCR, OCR edited, manual) and the first OCR values, for comparison.

### T8 — Common web attacks
- **SQL injection:** Drizzle uses parameters; no string-built SQL.
- **XSS (script injection):** React escapes text by default. Admin-written Markdown is rendered with a safe renderer (no raw HTML). Content Security Policy header.
- **CSRF (fake form posts from other sites):** Server Actions check the origin; cookies are `SameSite=Lax`, `httpOnly`, `Secure`.
- **Clickjacking:** `frame-ancestors 'none'` header.
- **Secrets:** only in environment variables. `server-only` import stops server code from going to the browser. `.env*` in `.gitignore`. GitHub secret scanning on.
- **Dependencies:** `npm audit` and Dependabot in CI. Install Next.js security patches quickly (there was one on 2026-11-03).
- **CSV injection:** escape cells that start with `=`, `+`, `-`, `@`.

### T9 — Database loss (free plan has no backups)
- Weekly CSV export reminder for the owner.
- Optional weekly `pg_dump` in GitHub Actions (only with a private repo, because the file has personal data).
- Migrations in Git, so the structure can always be re-built.

### T10 — Free-plan outages (paused project, used-up credits)
- Keep-alive job every 3 days.
- Few production deploys, cached static pages.
- Dashboard warnings for old jobs and storage use.
- Error page shows Messenger/Viber links so clients can still reach the business.

---

## 2. Data Privacy Act basics

| Idea | How the app does it |
|---|---|
| **Consent** | Unticked checkbox + link to privacy notice on request step 1. We save the date and the notice version. |
| **Transparency** | Privacy notice page: what, why, how long, who sees it, rights, contact person. |
| **Collect only what is needed** | Name, email, mobile, optional business name, documents for the service, payment text values. No receipt images, no birthdays, no ID numbers as fields. |
| **Limited keeping** | Files auto-deleted N days after Completed/Cancelled. Drafts deleted after 7 days. Request text kept for business records (period to confirm with owner, for example 5 years for tax records — owner decides). |
| **Access control** | Every request and file is checked on the server. Only admins see client data. Tracking shows minimal data. |
| **Audit log** | `activity_log` for logins, file opens, status changes, settings, exports. |
| **Security** | Encryption in transit (HTTPS), private storage, 2FA, rate limits. Supabase encrypts data at rest. |
| **Data subject rights** | Client can email the business to ask for a copy, a fix, or deletion. Admin has a "Delete client data" action (deletes files, clears personal fields, keeps a minimal record for payments if needed). |
| **Breach response** | Simple steps in this doc: find, contain (turn off accounts, rotate keys), check activity log, tell affected clients and the NPC when the law requires it (the owner should confirm the rules and time limit). |
| **Data location** | Supabase region chosen close to the Philippines (for example Singapore). Written in the privacy notice. |

---

## 3. Key rotation steps (if a secret leaks)

1. Make a new key in the service dashboard (Supabase, Brevo, Turnstile).
2. Update it in Vercel and GitHub secrets.
3. Re-deploy.
4. Remove the old key.
5. Check `activity_log` for strange actions.
6. Write what happened in PROGRESS.md.
