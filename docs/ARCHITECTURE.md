# ARCHITECTURE.md

How the app is built and how data moves through it.

---

## 1. Versions (checked 2026-11-06)

I read the current official docs on **2026-11-06**. At install time (Phase 1) we use the newest patch of each line below and write the exact numbers in `package.json` and in PROGRESS.md.

| Tool | Version we plan to use | Notes from the docs |
|---|---|---|
| Next.js | **16.4.x** (newest patch) | 16.x is the "Active LTS" line. 16.4 was released 2026-10-06. A security release came out 2026-11-03, so we must install the newest patch. |
| React | 19.x (the version Next.js 16.4 asks for) | Comes with Next.js. |
| Node.js | 22 LTS | Must match what Vercel builds with. Set it in `.nvmrc` (and in the Vercel project settings). |
| Supabase JS | `@supabase/supabase-js` 2.x + `@supabase/ssr` (newest) | `@supabase/ssr` handles login cookies in Next.js. |
| Supabase Auth 2FA | TOTP (authenticator app codes) | Supabase docs: TOTP MFA is free and on by default for all projects. Supabase gives no recovery codes. Instead, each admin can register a second TOTP device as a backup (up to 10). |
| Drizzle ORM | `drizzle-orm` + `drizzle-kit` (newest stable) + `postgres` driver | Supabase and Drizzle docs both say: with the "Transaction" pooler, set `prepare: false`. |
| Tesseract.js | **7.0.x** | v7 is 15–35% faster than v6. It runs in the browser as WebAssembly. |
| Brevo | Transactional email REST API (v3), called with plain `fetch` | Free plan: 300 emails per day. Sender address or domain must be verified in Brevo. |
| Cloudflare Turnstile | Free plan | The server **must** call the Siteverify API. A token is valid for 5 minutes and works only once. |
| Vercel Next.js support | Built in (Vercel makes Next.js) | App Router, Server Actions, Route Handlers and the proxy file all work with no extra adapter. |
| Tailwind CSS, shadcn/ui, Zod, Vitest, Playwright | Newest stable at install | Not on the "must verify" list. We check their install guides in Phase 1. |

### Free plan limits that matter (checked 2026-11-06)

Please re-check these on the official pricing pages in Phase 1. Some numbers came from summaries of the official pages.

| Service | Limit | What it means for us |
|---|---|---|
| Supabase | 500 MB database, 1 GB file storage, 5 GB egress (download traffic) per month, 2 projects | Files must be small and deleted after a time. Storage meter in admin. |
| Supabase | Project pauses after 7 days with no activity | Weekly keep-alive job. |
| Supabase | No automatic backups on the free plan | CSV export + optional weekly database dump. |
| Vercel (Hobby, free) | Fixed monthly usage limits; the site can be paused when they are used up | **Hobby is meant for non-commercial use.** A real business site may need a paid plan. Check Vercel's current terms and limits before real clients use the site. Preview deployments count toward the limits too. |
| Brevo | 300 emails per day | Enough for this business. We log each send. |
| Turnstile | Free, up to 20 widgets | We need 1–2 widgets. |
| GitHub Actions | Free for public repos; private repos get a monthly minutes allowance | Our jobs take about 1 minute each. |

---

## 2. Why Drizzle and not Prisma

1. **Small and simple.** Drizzle is a thin TypeScript layer on top of SQL. No extra engine to bundle in serverless functions, so cold starts stay short.
2. **Works well with the Supabase pooler.** The official Drizzle + Supabase guide shows the exact setup (`postgres(url, { prepare: false })`).
3. **Migrations are plain SQL files.** Easy to read and review. We can add RLS rules and triggers in the same SQL files.
4. **Types come from the schema file.** No code-generation step to forget.
5. **Good for the portfolio.** The SQL is visible, which shows database skill.

Prisma is also a good tool, but it adds more moving parts for no benefit in this small app.

---

## 3. Folders

```
/
├─ CLAUDE.md, PROGRESS.md, README.md, .env.example
├─ docs/                         planning docs (this folder)
├─ drizzle/                      SQL migration files (made by drizzle-kit, reviewed by hand)
├─ scripts/                      Node scripts run by GitHub Actions or by hand
│   ├─ keep-alive.ts             tiny query so Supabase does not pause
│   ├─ cleanup-files.ts          deletes old client files and expired drafts
│   └─ seed.ts                   sample services, settings, first owner account
├─ .github/workflows/
│   ├─ ci.yml                    lint, typecheck, unit tests on every push
│   └─ scheduled-jobs.yml        weekly keep-alive + daily cleanup
├─ public/                       static files (favicon, og image)
├─ tests/
│   ├─ e2e/                      Playwright tests
│   └─ fixtures/receipts/        sample receipt TEXT (not images) for parser tests
└─ src/
    ├─ app/
    │   ├─ (public)/             home, services, how-it-works, contact, privacy
    │   ├─ request/              multi-step request flow
    │   ├─ track/                tracking page
    │   ├─ admin/
    │   │   ├─ login/  mfa/      login and 2FA screens
    │   │   └─ (protected)/      dashboard, requests, settings, activity, export
    │   └─ api/
    │       ├─ upload/           file upload route (multipart form)
    │       └─ admin/export/     CSV download routes
    ├─ components/
    │   ├─ ui/                   shadcn/ui parts
    │   ├─ public/  request/  admin/
    ├─ lib/                      code safe for browser AND server
    │   ├─ validation/           Zod schemas
    │   ├─ status.ts             request status rules (allowed changes)
    │   ├─ money.ts              centavos helpers
    │   └─ tracking-code.ts      code format helpers
    ├─ ocr/                      browser-only OCR code
    │   ├─ engine.ts             loads Tesseract.js, runs the passes
    │   └─ parsers/              gcash.ts, maya.ts, bdo.ts, index.ts, types.ts
    ├─ server/                   server-only code ("server-only" import)
    │   ├─ db/                   schema.ts, client.ts
    │   ├─ auth/                 requireAdmin.ts, requireRequestAccess.ts
    │   ├─ services/             requests.ts, payments.ts, files.ts, settings.ts
    │   ├─ storage/              supabase-storage.ts (one small wrapper)
    │   ├─ email/                brevo.ts, templates/
    │   ├─ security/             turnstile.ts, rate-limit.ts, file-type.ts
    │   └─ audit/                log-activity.ts
    └─ proxy.ts                  Next.js 16 name for middleware (session refresh only)
```

**Host-independent rule:** the only host details in the code are the client IP header and the site address (`src/server/security/client-ip.ts`, `src/lib/site-url.ts`). All server code uses Node.js and standard Web APIs. Moving to another host should need only a new config file.

---

## 4. Data flow (big picture)

```
Client phone ──► Next.js pages (server rendered, small JS)
                   │
                   ├─► Server Actions / Route Handlers
                   │       ├─ Zod validation
                   │       ├─ Turnstile check + rate limit
                   │       ├─ access check (admin or request cookie)
                   │       ├─ Drizzle ──► Supabase Postgres (pooled)
                   │       ├─ Storage wrapper ──► private bucket
                   │       ├─ Brevo API (emails)
                   │       └─ activity_log
                   │
                   └─► Browser only: Tesseract.js reads receipt image
                        (image stays on the phone)

GitHub Actions ──► scripts/*.ts ──► Supabase (direct, with secret key)
```

- **Public pages** (Home, Services, etc.) are mostly static and re-built when the admin changes content (`revalidatePath`). This keeps them fast on slow data and light on the free hosting limits.
- **Forms** use Server Actions. File upload uses a Route Handler because it sends a file.
- The browser never talks to the database directly.

---

## 5. Auth (admin login)

- **Supabase Auth**, email + password. Public sign-up is **turned off**. The owner invites staff from the admin area (or the first owner is created by the seed script).
- **2FA is required** for every admin. After password login, if the user has no TOTP device, they must add one before they can see anything. Every protected page and action checks that the session is at level **AAL2** (password + 2FA code).
- Password rules: at least 12 characters. Supabase "leaked password protection" is turned on if the free plan allows it (check in Phase 1).
- Roles live in our own table `admin_profiles` (`owner` or `staff`). `requireAdmin({ role })` checks:
  1. a valid Supabase session,
  2. AAL2,
  3. an active `admin_profiles` row,
  4. the needed role.
- `proxy.ts` only refreshes the login cookie and sends non-logged-in users from `/admin/*` to `/admin/login`. **It is not the real security check.** Every Server Action and Route Handler calls `requireAdmin()` again.
- **Fresh 2FA for risky actions:** changing a payment QR, account number, or adding an admin needs a new 6-digit code typed in the last 5 minutes.

### Client access (no login)

Clients do not have accounts. They get access to **one request** in two ways:

1. **Draft cookie.** When the draft is created, the server sets an `httpOnly` cookie with a long random token. The database stores only a hash of the token. It lasts 7 days and lets the client upload files and pay for that request only.
2. **Tracking access.** On the tracking page, the client enters the tracking code + last 4 phone digits. If correct, the server sets a short cookie (1 hour) for that request. It allows: see status, add payment, upload more files only when status is "Waiting for client". It **never** allows viewing files.

`requireRequestAccess(requestId, action)` checks the cookie, the hash, the expiry, and whether the action is allowed for the current status.

---

## 6. File upload flow

```
1. Client picks a file (JPG, PNG, PDF).
2. Browser checks type and size. Images are compressed in the browser
   (resize long side to max ~2000 px, JPEG quality ~0.8).
3. Browser sends ONE file per request to POST /api/upload (multipart).
4. Server:
   a. requireRequestAccess(requestId, "upload")
   b. rate limit (per IP and per request)
   c. checks size ≤ max (setting, default 3 MB)
   d. reads the first bytes ("magic bytes") to find the REAL type
      (JPG starts FF D8 FF, PNG starts 89 50 4E 47, PDF starts %PDF-)
      and rejects anything else, even if the name says .jpg
   e. checks file count for this request ≤ max (setting)
   f. checks total storage is under the hard limit
   g. makes a random path: requests/{requestId}/{uuid}.{ext}
      (the original file name is stored only in the database)
   h. uploads to the PRIVATE bucket with the secret key
   i. inserts a request_files row
5. Server returns the file id. Browser shows it in the list.
```

- Why through our server: so the server can check the real type before the file is saved. A 3 MB file fits inside the request size limits of Vercel (about 4.5 MB for a function request body) and other hosts.
- **Admin opens a file:** the server checks `requireAdmin()`, writes an `activity_log` row ("file opened"), and returns a **signed link that works for 60 seconds**.
- Clients cannot open or download files after upload. They see only the file name and size in the flow.

---

## 7. OCR flow (short version — full design in OCR_PAYMENTS.md)

```
1. Client is on the payment step and has paid in their own app.
2. Client picks the receipt screenshot.
3. The image is shown on screen. It is NOT uploaded.
4. Client taps "Read my receipt". Only now we load Tesseract.js
   (lazy load, because it is a few MB).
5. Pass 1: read all text with word positions.
6. The parser for the chosen payment method finds the labels
   ("Ref No.", "Amount", date).
7. Pass 2: read only the areas next to the labels, with a
   digits-only character list.
8. Form fields fill in. Client checks every field, fixes errors,
   ticks "I checked these values", and submits.
9. Server validates again with Zod, checks the reference number
   is unique for that payment method, and saves the payment.
```

If OCR fails, is slow, or the phone is too old, the client types the values by hand. The manual form is always visible.

---

## 8. Email flow

- One small module `server/email/brevo.ts` sends emails with `fetch` to the Brevo REST API. No SDK, so it works on any host.
- Templates are plain TypeScript functions that return subject + HTML + text.
- Emails:
  | Event | To | Content |
  |---|---|---|
  | Request submitted | Admin inbox | Service, client name, link to admin page (no documents, no phone number in full) |
  | Request submitted | Client | Tracking code, how to track, what happens next |
  | Status changed (selected statuses) | Client | New status + admin's message + tracking link |
  | Payment submitted | Admin inbox | Amount, method, reference, link |
  | Payment method changed | Owner | Alert: who changed what, when |
  | Contact form | Admin inbox | Message, reply-to = client email |
- Each send is saved in `email_log` (status, Brevo message id, error). This also lets us count the daily total against the 300/day limit.
- If Brevo fails, the main action still succeeds. The error is logged and shown in admin as "Email not sent — retry". We do not block a client because of email.
- **Sender:** Brevo needs a verified sender. Best is a custom domain with SPF, DKIM, and DMARC records (these DNS records prove the email is really from us). Using a free Gmail address as the sender often lands in spam. See open question 1.

---

## 9. Scheduled jobs

Both jobs are Node scripts in `/scripts`, run by **GitHub Actions** (`scheduled-jobs.yml`). They connect to Supabase directly with secrets stored in GitHub. They do not call the website, so they use none of its hosting limits.

| Job | When | What it does |
|---|---|---|
| keep-alive | Every 3 days (safe margin under the 7-day pause) | Runs `select 1` and updates `site_settings.last_keep_alive_at` |
| cleanup | Daily | 1) Deletes files of requests that are Completed/Cancelled for more than N days (setting). 2) Deletes Draft requests older than 7 days with their files. 3) Deletes old `rate_limits` rows. 4) Writes a summary to `activity_log` and updates `site_settings.last_cleanup_at` |
| backup (optional) | Weekly | `pg_dump` of the database, saved as a GitHub Actions artifact for 7–30 days. Only if the repo is private (the dump has personal data). |

- Cleanup deletes the storage file first, then marks `request_files.deleted_at`. If one step fails, it tries again the next day.
- The admin dashboard shows "Last cleanup" and "Last keep-alive". If older than 3 days, it shows a warning.
- A manual "Run now" button in GitHub (workflow_dispatch) is included for testing.

---

## 10. Hosting

- **Vercel**, on the free subdomain (`something.vercel.app`) for now. No domain yet. Next.js needs no adapter.
- No host config file is needed. The build command is `pnpm build` (Vercel finds it by itself).
- **Save credits:**
  - Static public pages, cached at the CDN.
  - Small images (`next/image`), no big hero videos.
  - Few production deploys (batch changes).
  - Tesseract.js files load from the jsDelivr CDN (its default), so they do not use our hosting traffic.
- Security headers (CSP, HSTS, etc.) are set in `next.config.ts` so they work on any host.
- Environment variables are set in the Vercel dashboard (Project > Settings > Environment Variables). The full beginner guide is `docs/SETUP_GUIDE.md`. List in `.env.example`.

### Environment variables (`.env.example` will contain these)

| Name | Used where | Secret? |
|---|---|---|
| `DATABASE_URL` | Server (Drizzle, pooled "transaction" URL, port 6543) | Yes |
| `DIRECT_DATABASE_URL` | Migrations only | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser (admin login only) | No (public by design) |
| `SUPABASE_SECRET_KEY` | Server + scripts (storage, admin invites) | Yes |
| `SUPABASE_BUCKET_CLIENT_FILES` | Server | No |
| `SUPABASE_BUCKET_PUBLIC_ASSETS` | Server | No |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Browser | No |
| `TURNSTILE_SECRET_KEY` | Server | Yes |
| `BREVO_API_KEY` | Server | Yes |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `ADMIN_NOTIFY_EMAIL` | Server | No |
| `APP_BASE_URL` | Server (links in emails) | No |
| `TOKEN_HASH_SECRET` | Server (HMAC for cookies, tokens, IP hashes) | Yes |

Note: Supabase is moving from "anon / service_role" keys to "publishable / secret" keys. In Phase 1 we use whichever the dashboard shows as current, and update this table.
