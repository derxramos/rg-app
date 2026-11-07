# PROGRESS.md

Update this file at the end of every work session.

**Current status:** All 8 phases are built and each is committed. The live checks with real accounts (Supabase, Brevo, Turnstile, Netlify, GitHub), the owner review of the privacy notice, and the owner approval of the case study are still open. See docs/SECURITY_CHECKLIST.md.
**Last updated:** 2026-11-06

**Next step:** Owner: answer the open questions, set up the real accounts, and run the live checklist. Then deploy a preview.

---

## Phase checklist

Details for each phase are in `docs/PHASES.md`.

- [x] Phase 0 — Planning docs
- [~] Phase 1 — Foundation and database (code done; hand steps and approval pending)
- [~] Phase 2 — Public pages with seed content (code done; approval pending)
- [x] Phase 3 — Request flow and file upload(code done, checked on this computer)
- [x] Phase 4 — Payment QR page and receipt OCR(code done, checked on this computer)
- [x] Phase 5 — Admin area(code done, checked on this computer)
- [x] Phase 6 — Emails and tracking page(code done, checked on this computer)
- [x] Phase 7 — Security hardening, tests, deploy(code done, checked on this computer)
- [x] Phase 8 — Portfolio case study page(code done, checked on this computer)

---

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-06 | Stack fixed by owner: Next.js App Router, TypeScript, Tailwind, shadcn/ui, Zod, Supabase Postgres, Netlify, Brevo, Turnstile, Tesseract.js | Given in the project brief |
| 2026-11-06 | ORM: **Drizzle** (not Prisma) | Small, no separate engine, plain SQL migrations, works with Supabase pooler using `prepare: false`. Details in ARCHITECTURE.md |
| 2026-11-06 | Admin login: **Supabase Auth** with TOTP 2FA required for every admin | TOTP 2FA is free and on by default for all Supabase projects |
| 2026-11-06 | Data access: **server-only**. RLS turned on for every table with no policies (blocks direct API access) | Clients have no login, so RLS rules for them do not fit well. One place for checks is easier to test |
| 2026-11-06 | File uploads go **through our server route** (not straight to Supabase from the browser) | So the server can check the real file type before saving. Files are ≤ 3 MB, which fits host request limits |
| 2026-11-06 | Rate limiting in **Postgres** (table `rate_limits`) | No extra service and no extra cost |
| 2026-11-06 | Scheduled jobs run in **GitHub Actions** as Node scripts that talk to Supabase directly | Host-independent, and they do not use Netlify credits |
| 2026-11-06 | Money stored as integer centavos | Floats cause rounding errors |
| 2026-11-06 | Tracking code: `RG-` + 8 characters from an alphabet with no look-alike letters | Easy to read on a phone, very hard to guess |
| 2026-11-06 | Only the **owner** role can change payment methods. Changing a QR needs a fresh 2FA code and sends an alert email | Protects against the QR swap attack |
| 2026-11-06 | Phase 1: package manager is **pnpm** (the starter project already had a pnpm lockfile) | CLAUDE.md says npm. All script names are the same, so `npm run` also works. See open question 7 |
| 2026-11-06 | Phase 1: shadcn/ui components are **written by hand** in the shadcn "new-york" style (with the `radix-ui` package and `components.json`) | The shadcn CLI tried to install an unknown package named `cn` and changed `pnpm-workspace.yaml`. I removed all of that |
| 2026-11-06 | Phase 1: the database enum has **9** statuses (DATABASE.md), the status badge shows **8** (DESIGN_SYSTEM.md) | Owner told me to build 8 and leave a TODO. See open question 6 |
| 2026-11-06 | Phase 1: admins cannot move a **draft** (only the client submits it, or the system cancels it when it expires) | DATABASE.md does not say who may move a draft. This is the safest reading. Tests cover it |
| 2026-11-06 | Phase 1: a database trigger writes every change of `payment_methods` to `activity_log` (action `payment_method.row_changed`) | Safety net for the QR swap threat, even if app code has a bug. The app can add a more specific row later |
| 2026-11-06 | Phase 1: database rules are tested on a real Postgres inside the test run (PGlite), no Supabase account needed | The triggers, checks and RLS flags are proved on every `pnpm test` |
| 2026-11-06 | Phase 1: Teal Ledger is the default palette. Harbor Navy works with `data-theme="alt"` | Owner choice for now. See open question 9 |
| 2026-11-06 | Phase 2: public content is read with `use cache` and a custom 5-minute profile (`site-content` in next.config.ts), with cache tags | Pages are static and fast, and cost few Netlify credits. A change in the database shows within 5 minutes. In Phase 5 the admin calls `revalidateTag` to show it at once |
| 2026-11-06 | Phase 2: `next build` now needs a database (the pages are built from it) | The build reads services and settings. Netlify has the variables, so this is fine there. A database error is never hidden or cached |
| 2026-11-06 | Phase 2: the service detail page uses `generateStaticParams`, with a placeholder slug when there are no services | Next.js needs at least one value. It puts the title and description in the HTML head (good for search engines) |
| 2026-11-06 | Phase 2: the contact form checks the values but does **not** send. A valid form shows "not switched on yet" with the Messenger and Viber links | Sending is Phase 6. This is the truthful state for now |
| 2026-11-06 | Phase 2: the privacy notice is a **draft** written from the docs, with [square brackets] for facts the owner must give. A yellow "Draft text" box shows while the version contains "draft" | Not legal advice. The owner must review it |
| 2026-11-06 | Phase 2: Markdown from the owner is shown with `react-markdown` (raw HTML is not shown, unsafe links are removed) | Matches SECURITY_AND_PRIVACY.md T8 |
| 2026-11-06 | Phase 2: git line endings are forced to LF with `.gitattributes` | On Windows, git made CRLF files and Prettier failed |
| 2026-11-06 | Phase 3: owner approved "do phases 3 to 8 and commit each" in one go | The "stop after each phase" rule was lifted by the owner for this run. Each phase is its own commit |
| 2026-11-06 | Phase 3: the draft cookie holds `<requestId>:<token>`; the database stores only an HMAC of the token | A stolen database cannot be used to open drafts |
| 2026-11-06 | Phase 3: after submit the draft cookie stops working; a 10 minute signed cookie shows the code on the "sent" page | DATABASE.md says the token is cleared on submit |
| 2026-11-06 | Phase 3: Turnstile is skipped in development when no secret key is set, and always required in production | Lets forms be tried locally. Production refuses without the key |
| 2026-11-06 | Phase 3: the file storage wrapper uses a local folder in development when Supabase keys are missing | Lets the upload flow be tried without an account. Never used in production |
| 2026-11-06 | Phase 4: a Draft with a payment stays a Draft until the client sends the request; a request that was already sent moves to payment submitted when the payment is saved | Matches FEATURES.md P11 and OCR_PAYMENTS.md section 7 together |
| 2026-11-06 | Phase 4: sample payment methods start OFF and are marked "SAMPLE - not real" | They must never show to real clients by accident |
| 2026-11-06 | Phase 4: the client may add more than one payment to a request | A client can pay in two parts. The admin sees all of them |
| 2026-11-06 | Phase 4: the receipt form sends the entry method (ocr, ocr_edited, manual) and the first OCR values as text | The server cannot see the picture. These values are for the admin to compare. They are not trusted for anything else |
| 2026-11-06 | Phase 5: every admin service function takes the acting admin and checks the role itself | A page or action cannot forget a permission. Tests cover it |
| 2026-11-06 | Phase 5: Server Actions use `withAdmin()`, and a unit test reads the source and fails if one forgets the check | Enforces CLAUDE.md rule 5 for future code too |
| 2026-11-06 | Phase 5: fresh 2FA is a code field in the risky form and a signed 5 minute cookie, not a dialog | Simpler, same safety. The design shows a dialog |
| 2026-11-06 | Phase 5: development bypass for the admin area (`DEV_ADMIN_BYPASS_EMAIL`), only when NODE_ENV is development | Lets the admin area be built and tested with no Supabase. Tested to be refused in production |
| 2026-11-06 | Phase 5: owner and staff can both verify payments for now | Open question 2 is still open. One line to change |
| 2026-11-06 | Phase 5: the `payment_verified` status has a PROVISIONAL badge | The admin must show it. The owner decides the final look |
| 2026-11-06 | Phase 6: the tracking lock uses `rate_limits` rows (one row per wrong try), not the columns on `requests` | It must work the same for codes that do not exist, so nobody learns which codes exist. The sliding 15 minutes is exact |
| 2026-11-06 | Phase 6: only request emails have a Retry button (they are rebuilt from the database) | The contact form and owner alert emails have no saved body. A failed contact form already shows the client the backup links |
| 2026-11-06 | Phase 6: status emails go out for Waiting for client, Payment verified, In progress, Completed and Cancelled, or whenever a message is written | Quiet statuses would send noise. One list to change |
| 2026-11-06 | Phase 6: a visitor from the tracking page sees no earlier files and cannot remove files | CLAUDE.md rule 9. They may only add more |
| 2026-11-06 | Phase 7: the CSP allows `'unsafe-inline'` for scripts, and is strict everywhere else | Next.js writes small inline scripts. A per-request nonce would make every page dynamic (no static pages, more Netlify credits). React escapes text and no raw HTML is rendered. Can be tightened later |
| 2026-11-06 | Phase 7: validate the form first, then check Turnstile | A Turnstile token works once. A typo must not use it up |
| 2026-11-06 | Phase 7: cleanup deletes storage first, then the database | A failure leaves the request in the list, so tomorrow's run finishes the job. No file is left without a record |
| 2026-11-06 | Phase 7: old QR pictures are kept (not deleted after 30 days) | They are tiny, and we can compare after a QR swap. No file listing in the storage wrapper |
| 2026-11-06 | Phase 7: "Delete client data" added (owner only, fresh 2FA, typed DELETE) | It was promised in SECURITY_AND_PRIVACY.md but was not built |
| 2026-11-06 | Phase 7: every file in `src/server` must start with `import "server-only"` (tested), with a short allow-list for files the Node scripts import | Enforces CLAUDE.md. The scripts cannot import files with that line |
| 2026-11-06 | Phase 8: the case study page is in the app at `/case-study`, noindex and not linked, until the owner approves it | It shows her business. The owner approves it first (PHASES.md done-when) |
| 2026-11-06 | Phase 8: screenshots are real pictures of the app with fake data, made by a script | They stay true to the real screens and can be remade after any design change |

---

## Decisions from the owner (answers to the 19 questions, 2026-11-06)

All earlier open questions are answered. What was done for each:

1. **Domain:** none yet. The site uses the free Vercel address. Hosting moved from Netlify to Vercel (`netlify.toml` removed, client IP header and site address code changed, docs updated).
2. **Verify payments:** owner only (`PAYMENT_VERIFY_ROLES = ["owner"]`, test added that staff are refused).
3. **Language:** English only.
4. **Keep files 30 days, 15 files max per request:** these were already the defaults.
5. **Repo is public.** Added: `tests/unit/repo-safety.test.ts` (fails if a key, token or private address is committed), `.github/SECURITY.md`, and the GitHub protections in `docs/SETUP_GUIDE.md` step 1. The database is still reachable only by the server, RLS is on, the file bucket is private.
6. **9th status `payment_verified`:** built as a real badge. Light lime green (#EAF3CF background, #3F5B0A text, both pass AA), icon `badge-check`. It sits between "Payment submitted" (blue) and "In progress" in meaning: money is confirmed, work is not finished. Documented in `docs/DESIGN_SYSTEM.md`.
7. **pnpm:** used. Next.js docs list pnpm as a supported package manager with its own commands. They do not say it is "recommended over npm". `CLAUDE.md` now says pnpm.
8. **Services:** the six names are in `scripts/seed-data/services.ts` (names only, no fees or checklists).
9. **Palette:** keep **Teal Ledger** (teal with a coral accent). Professional, warm, and not tied to a gender. Harbor Navy stays as the alternative theme.
10. **Legibility:** tracking code is bigger (3xl/4xl), bold monospace, wide letter spacing, easy to select. Added a `prefers-contrast: more` style (darker muted text and stronger borders).
11. **Staff and payments:** owner only (same as 2).
12 and 15. **Contact details** are the defaults in `src/lib/validation/settings.ts`: phone and Viber +63 991 234 8299, email rgsbookkeeping73@gmail.com, address P. Zamora St. Pob. 17, Batangas City, Philippines 4200.
13. **Terms and privacy notice:** written in plain words (`src/content/terms.ts`, `src/content/privacy-notice.ts`). Records kept 5 years, data region Singapore. The draft banner is gone. **The owner must read and approve both** (a lawyer check is wise).
14. **Dead links:** the pages exist now. Everything that needs the owner's hands is in `docs/SETUP_GUIDE.md`.
16. **Spam check:** Turnstile + hidden honeypot field + rate limits are on the contact, request and tracking forms. Needs the Turnstile keys (guide step 3).
17. **Case study:** public at `/case-study`, indexed, in the sitemap, not in the menu. It uses fake data only.
18. **Receipts:** no official receipt. When the owner verifies a payment the client gets a simple acknowledgment email (amount, method, reference, date) that says it is not an official receipt and tells them to send a message through the Contact page. The tracking page shows the same note (it must not show payment details, CLAUDE.md rule 9). The earlier ask for sample real receipts is still useful for OCR accuracy, but it does not block anything.
19. **Live checks:** still need the owner's real accounts. The full list of variables and the beginner steps are in `docs/SETUP_GUIDE.md`.

### Go-live notes (2026-11-07)

- Vercel build fixes so far: pooler address instead of the direct one, jsonb text values, `max_pipeline: 1` for the Supabase pooler, and a clear error for the direct address.
- Added `pnpm db:check` (scripts/db-check.ts). It tests both database addresses with `select 1` and never prints a password.
- Vercel build then failed with `password authentication failed`: the password in the address does not match the Supabase database password. Fix is to reset it and update `.env.local`, Vercel and GitHub (see SETUP_GUIDE troubleshooting).

### Still open

- Owner reads and approves the Terms and privacy notice.
- Check Vercel's terms: the free Hobby plan is for non-commercial use.
- Gmail as the email sender may land in spam. A custom domain fixes this later.
- Live pass of `docs/SECURITY_CHECKLIST.md` section 3.

---

## Phase 1 report

### What is done

- **Design system:** all tokens from DESIGN_SYSTEM.md sections 2 and 3 are in `src/app/globals.css`. Teal Ledger is the default. Harbor Navy is `[data-theme="alt"]`. Fonts are in `src/app/fonts.ts` (two local files, weights 400 and 700). The peso sign shows correctly. Favicon is `src/app/icon.svg`.
- **UI parts** (`src/components/ui`): Button (variants incl. `accent`, sizes 44/44/52, `loading`), Input (+ prefix box), Label, Textarea, Select (+ native select), Checkbox, Switch, Card, Badge, Alert, Dialog, Sonner, Skeleton, Tabs, Table, Progress.
- **Shared parts** (`src/components/shared`): Logo, StatusBadge (8 statuses), PaymentStateBadge, WarningBox (info, warning, danger, success, strong), EmptyState, Stepper (5 steps, compact on phone), TrackingCode, BackupContactBlock, SiteHeader, SiteFooter, field error and hint lines.
- **Helpers:** `src/lib/money.ts`, `src/lib/time.ts` (Manila), `src/lib/status.ts` (status rules), `src/lib/contact-links.ts` (only https and viber links are accepted), `src/lib/slug.ts`, `src/lib/validation/settings.ts` (one Zod schema per setting). All have tests.
- **/dev/ui** shows every part. It returns 404 in production (checked with a production build).
- **Database:** Drizzle schema for all 13 tables (`src/server/db/schema.ts`). Migration 0000 is made by drizzle-kit. Migration 0001 is hand-written: link to `auth.users`, extra checks, `updated_at` triggers, append-only `activity_log` (plus a purge function for rows older than 1 year), the `payment_methods` change log, the last-owner protection, and removal of table rights from the public roles. RLS is on for every table with no policies.
- **Server:** `src/server/db/client.ts` (pooled URL, `prepare: false`, opened only when first used), `src/server/services/settings.ts` (public settings only).
- **Scripts:** `scripts/seed.ts` (default settings, services, first owner), `scripts/setup-storage.ts` (both buckets).
- **Project:** `.env.example` (every variable has a comment), `netlify.toml`, `.nvmrc` (22), Prettier, GitHub Actions CI (format, lint, typecheck, unit tests), Playwright config and a smoke test, README.
- **Hello page** at `/` reads `home_texts.headline` from the database. It shows a friendly message when the database is not connected.
- **git:** repository started in this folder only (not in the parent ZOLB folder). Branch `phase-1-foundation` merged into `main`. Nothing was pushed.

### Checks run on this computer (2026-11-06)

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`: no problems.
- `pnpm test`: 70 tests pass in 8 files (including the real-Postgres database tests).
- `pnpm build`: works with no database. `/dev/ui` is 404 in production. `/` is 200.
- `/dev/ui` checked in Chrome at 390 px and 1440 px wide (page loaded in a frame of that width): no sideways scrolling, both font weights load, every control is at least 44 px tall (small buttons are 40 px from md, as the design says), and there is a visible focus ring on every control type, link and the mobile menu.
- No secrets in the code (searched). `.env.local` is ignored by git. `.env.example` is allowed.
- No font weights other than 400 and 700. No colors written as hex outside `globals.css`.
- Test-email marker search: `zolb-test` appears only in `.env.example` and in tests that use an in-memory database. No real database was touched, so there is nothing to clean.

### Phase 1: what you must do by hand (I cannot: they need your accounts)

1. Create the Supabase project (region near the Philippines). Turn **off** public sign-up (Auth settings). In API settings, turn off or limit the Data API for the `public` schema.
2. Copy `.env.example` to `.env.local` and fill it in. Then run: `pnpm db:migrate`, `pnpm storage:setup`, `pnpm db:seed`.
3. Run `pnpm test:integration`. It proves the public key cannot read or write any table. (It skips itself if the keys are missing.)
4. Connect the repository to Netlify and make one **deploy preview**. Check that `/` shows "Database connected". Set the same variables in Netlify.
5. First time only: `pnpm exec playwright install chromium`, then `pnpm test:e2e`. I did not run the Playwright tests (the browser download is large).
6. Re-check the free-plan limits on the official pricing pages (Supabase, Netlify, Brevo). I did **not** do this. The limits in ARCHITECTURE.md are still the 2026-11-06 values.
7. The seed creates one account with role **owner**. Use the real owner email for production. The owner sets up 2FA at the first login (Phase 5 builds that screen).

### Exact versions installed

Node 24.18.0 on this computer (CI and Netlify use 22 from `.nvmrc`), pnpm 11.18.0.
next 16.4.5, react 19.3.0, react-dom 19.3.0, tailwindcss 4.3.4, @tailwindcss/turbopack 4.3.4, radix-ui 1.8.1, lucide-react 1.68.0, sonner 2.0.8, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, tw-animate-css 1.4.0, zod 4.6.7, drizzle-orm 0.45.4, drizzle-kit 0.31.11, postgres 4.0.0, @supabase/supabase-js 2.119.0, @supabase/ssr 0.12.7, server-only 0.0.1, vitest 5.1.0, @electric-sql/pglite 0.5.15, @playwright/test 1.64.1, prettier 3.9.10, typescript 5.9.3, eslint 9.39.5, tsx 4.23.15, dotenv 18.0.9.
Not installed yet (later phases): tesseract.js (Phase 4). Brevo and Turnstile use plain `fetch` (no package).

### Not done in Phase 1 (on purpose)

- Real services, checklists, fees, payment methods (Phase 4 seeds placeholders marked SAMPLE).
- The login code with `@supabase/ssr`, `requireAdmin()` and `requireRequestAccess()` (Phases 3 and 5). The packages are installed.
- Scheduled job scripts (keep-alive, cleanup) and Dependabot (Phase 7). The database function for the 1-year log purge is ready.
- `next.config.ts` is unchanged (security headers come in Phase 7). The starter file still has `cacheComponents` and `partialPrefetching` turned on.

---

## Phase 2 report

### What is done

- **Layout:** the public header (desktop menu, mobile menu button, skip link), footer with the Messenger and Viber block, and one shell used by every public page (`src/components/shared/public-shell.tsx`).
- **Pages:** Home `/`, Services `/services` (with loading skeleton and empty state), Service detail `/services/[slug]` (checklist, exact empty-checklist text, "rules and fees can change" note, Start button that pre-selects the service), How it works `/how-it-works`, Contact `/contact` (form screen only), Privacy notice `/privacy` (version and date badges).
- **Error pages:** 404 page, error page with "Try again", and a last-resort page. They show the Messenger and Viber links when the owner has set them.
- **SEO:** a title and description on every page, canonical links, `sitemap.xml` (public pages and active services), `robots.txt` (hides admin, request, track, api, dev), and an Open Graph image drawn in code.
- **Content from the database:** headline, intro, contact details, hours, social links, privacy version, retention days and the services list. Server code: `src/server/services/site-content.ts`.
- **New helpers with tests:** Philippine mobile number rules (`src/lib/phone.ts`), contact form rules (`src/lib/validation/contact.ts`), site address (`src/lib/site-url.ts`), privacy text builder.
- **Local test database:** `pnpm dev:db` runs a real Postgres inside Node (PGlite). It needs no account. See the README. It is for looking at pages, not a replacement for Supabase.
- **Home page:** hero with CSS shapes (no photos), services, five steps, contact block. No government logos. No invented requirements or fees.

### Checks run on this computer (2026-11-06)

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`: no problems.
- `pnpm test`: 100 tests pass in 12 files.
- `pnpm build` (against the local test database, with 0 services and with 2 services): works. Public pages are static.
- **360 px wide:** all 9 page types (home, services, two service details, unknown service, how it works, contact, privacy, 404) have no sideways scrolling, exactly one main heading, the right font, and controls at least 44 px tall (a link inside running text is the only exception).
- **Lighthouse (mobile, production build, run on every public page):** Performance 95 to 100, Accessibility 100 on every page in the last run, SEO 100, Best Practices 96 to 100. The goals were 90 and 95. The only failing check is the 404 console error from the `/request` and `/track` prefetch (see Known limits).
- **Content change test:** changing the headline, intro, social link, phone and email in the database showed on the pages after the cache refresh (a server restart clears it at once).
- **Safe text test:** a service description with a script tag and a `javascript:` link showed neither.
- **Not visible to visitors:** an inactive service is hidden from the list, the sitemap and its own address.
- **Error page** checked in the browser: header, footer, Messenger and Viber stay visible.

### Known limits

- `/request` and `/track` do not exist yet (Phases 3 and 6). Links to them show the 404 page and the browser console shows 404 errors for their prefetch. This is the only thing that lowers the Best Practices score.
- A service address that does not exist (for example `/services/nope`) shows the not found page and a "noindex" tag, but the HTTP status is 200, not 404. This is how Next.js streams a not-found inside a prerendered page. The `robots` tag keeps it out of search results.
- The placeholder address `/services/no-services-yet` exists only to let the build work with no services. It shows the not found page.
- The local test database (PGlite) allows one connection at a time. `pnpm build` against it can fail with "ECONNRESET" or "bind message". Run it again. Supabase does not have this limit.
- Error page when the database is down: the Messenger and Viber links come from the database. They are kept in the page cache, so they usually still show. If the very first load fails, the error page has no links.

### New: you must do by hand

1. Phase 1 hand steps are still open (Supabase, Netlify). Public pages need a working `DATABASE_URL` to **build**.
2. Look at the pages on your own phone (real device, real network): `pnpm dev` and open the address of your computer on the same Wi-Fi, or use the Netlify preview.
3. Answer questions 13 to 16 above and the older open questions.

### Packages added in Phase 2

react-markdown 10.1.0, @electric-sql/pglite-socket 0.2.18 (dev only). Everything else is unchanged from Phase 1.

---

## Phase 3 report

### What is done
- **Step 1** `/request` (service pre-selected with `?service=`), tracking code page, documents page, review page, "request sent" page, and an "expired or no access" page. Consent is never pre-ticked. A hidden trap field catches robots.
- **Security helpers:** Turnstile check on the server (always called, skipped only in development with no secret key), Postgres rate limiter (one atomic statement), HMAC token helpers, IP hashing, file-type check by first bytes.
- **Tracking code:** `RG-` plus 8 characters from 31 safe characters, retries on a clash (tests).
- **`requireRequestAccess()`:** draft cookie (7 days, only a hash is saved) and tracking session (1 hour). Tests cover: no cookie, wrong token, another request's cookie, expired, submitted request, forged or expired tracking session, and which actions each status allows.
- **Upload:** `POST /api/upload` checks access, rate limits (per visitor and per request), size, the real file type, file count, the 95 percent storage stop, then saves with a random path and a database row. Photos are shrunk in the browser first (long side 2000 px, quality 0.8). Files can be removed while the request is a Draft.
- **Submit:** moves the request to Submitted, clears the draft token, writes the timeline. A short signed cookie lets the "sent" page show the code once more.
- **Storage:** one wrapper (`src/server/storage`). Supabase in production, a `.local-storage` folder in development only.
- **Tests:** 146 unit tests (all pass) plus Playwright end-to-end tests (all pass on phone and desktop profiles): full flow, consent error keeps typed values, real PNG accepted, a program renamed to .jpg refused, another browser cannot open or upload to the request, after sending the draft cookie no longer works.

### Not verified here
- Real Supabase Storage and a real Turnstile widget (no accounts). The code paths are tested with fakes.
- "Slow 4G on a real phone" and the "renamed .exe" check in a real browser against Supabase Storage: please do these by hand.
- Rate limit and Turnstile blocking on repeated submits: the helpers are unit tested, and the form action uses them, but I did not repeat-submit in a browser.

### Notes
- `pnpm test:e2e` first runs `scripts/e2e-seed.ts`, because public pages cache the services list for 5 minutes. Stop any running dev server before running it.
- Set `DB_POOL_MAX=1` when you use the local test database (`pnpm dev:db`).

---

## Phase 4 report

### What is done
- **Payment step** `/request/[id]/payment`: every active payment method as a card with the QR picture, **Save QR image**, the account name large (24 px bold), a "Check the name before you pay" warning, the account number with **Copy**, and instructions. "Skip for now" goes to the review. With no active method it says "Please contact us to pay" with the Messenger and Viber block.
- **Receipt step** `/request/[id]/receipt` (900 px wide, picture on top on a phone): picture preview with zoom, payment method, **Read my receipt**, editable reference, amount (with a peso prefix) and date, "Read from image. Please check." and "Not sure. Please check." labels with a yellow border, a confirm tick, and the manual form is always there. The picture is shown with an object URL and is freed when it changes. The file input has no name and is outside the form, so the picture cannot be sent.
- **OCR** (`src/ocr`): Tesseract.js 7, loaded only when the client taps the button. Image preparation (rotation, size about 1400 px, grey, contrast, dark-mode turn around), pass 1 (all text with positions), pass 2 (digits only, next to the labels), merge, 30 second time limit, worker always closed. Hidden when WebAssembly is missing.
- **Parsers** for GCash, Maya and BDO from one small factory, with **placeholder** label patterns (real formats are unknown). Shared helpers: amount (both decimal styles), date (many formats), look-alike fixes, label and region finding. 6 fake-sample fixtures and 62 parser and helper tests.
- **`savePayment`:** access check, 5 per hour per request, Zod rules (amount 1 to 10,000,000 centavos, date not in the future and not older than 60 days in Manila time, reference 6 to 30 letters or digits, confirm tick, active method), duplicate reference per method gives "This reference number was already used. Please check it.", the account the client saw is saved as a snapshot, and a sent request moves to payment submitted. A Draft stays a Draft until the client sends the request. Then it becomes payment submitted.
- **Review page** shows the payment values. Submit chooses Submitted or Payment submitted.
- **Seed:** SAMPLE payment methods (GCash, Maya, BDO) with a fake QR picture that says "SAMPLE QR - NOT REAL". They start OFF.
- **Bug found by a test:** a minus sign was ignored, so "-5" was read as 5. It is refused now.

### Measured (see docs/OCR_PAYMENTS.md section 11)
- Reading tool download: about **4.2 MB** (5 files, CDN). Reading time: about **3 seconds**, on this fast computer, with a **synthetic** clean receipt. All three values were read right.
- The Playwright test proves that **no request contains the receipt picture bytes**.

### Not verified here
- OCR on **real** GCash, Maya and BDO receipts (none collected). Accuracy numbers are unknown. Parser patterns are placeholders.
- OCR on one Android and one iPhone, and on slow data. Please test by hand.
- Real Supabase Storage for the QR image (the sample QR is a local file).

### Notes
- To see payment methods locally: run the seed with `SEED_ACTIVATE_SAMPLE_PAYMENTS=1`, or turn a method on in the admin area (Phase 5).
- `pnpm typecheck` now runs `next typegen` first, because `PageProps` types are generated by Next.js. (Before this, CI could not have typechecked the pages.)

---

## Phase 5 report

### What is done
- **Access checks** (`src/server/auth`): `requireAdmin()` checks a valid session, **AAL2** (password plus 2FA code), an **active** `admin_profiles` row, and the role. `withAdmin()` wraps every Server Action. `guardAdminPage()` redirects pages. A turned-off admin is blocked at once. Fresh 2FA (a code typed in the last 5 minutes) is a signed cookie.
- **Login** `/admin/login` (5 tries per 15 minutes per visitor, the same message for every failure, success and failure written to the activity log), **2FA** `/admin/mfa`, **2FA setup** `/admin/mfa/setup` (QR picture, secret text, first code, then a "add a backup device" step), log out. `src/proxy.ts` refreshes the login cookie and sends logged-out people to the login page. It is not the real check.
- **Dashboard:** counts by status, the "needs action" list, the storage meter (yellow at the warning percent, red at 95), emails today out of 300, last cleanup and keep-alive with a warning after 3 days, who last changed a payment method, and the weekly backup reminder.
- **Requests:** list with filters (status, service, dates, search, show drafts), a table from 768 px and cards on a phone, 25 per page. Detail page: client info, files with **Open** (a 60 second signed link, every open is logged), payments with the strong OCR warning above **Mark payment verified** (disabled until "I found this payment in our account" is ticked), reject with a reason, status change with only the allowed next statuses and an optional message, timeline, internal notes (yellow dashed box, lock) and client messages (blue box, send icon).
- **Settings:** payment methods (owner only, fresh 2FA to change the QR, account name or number or to add one, new QR files get a new random name, delete is blocked when payments used it), services and checklists (start empty), site content, file settings (owner only), admin users (owner only, fresh 2FA, last owner is protected). Changes to services and settings show on the public website **at once** (`updateTag`).
- **Activity log** page (filters, payment method rows highlighted, read-only) and **CSV export** (owner only, formulas made safe, logged).
- **Tests:** 267 unit tests (all pass). They include the permission tests: staff cannot change payment methods, change file settings, invite or change admins, or export; logged-out and password-only sessions are refused; a test that **reads the source** and fails if any admin Server Action or admin route forgets `withAdmin` or `requireAdmin`. Playwright admin tests (all pass on phone and desktop profiles): dashboard, filters, verify needs the tick, status change, notes look different, a QR/account change needs a fresh code and is logged twice (app row and database trigger row, with the admin id), a services change and a contact change show on the public site at once, CSV download, bottom bar and 44 px controls.
- **Bug fixes along the way:** the dev-storage route now needs an admin for client files.

### NOT verified here (needs your Supabase project)
- The **real** login, 2FA enrol and verify, invite by email, and the proxy redirect. The code uses `@supabase/ssr` and `supabase.auth.mfa` as documented, but I could not run it. Please test: log in, set up 2FA, log out, log in again, invite a staff account, turn it off.
- Real Supabase signed links and the public-assets bucket for QR pictures.
- How the "fresh 2FA" check behaves with a real authenticator app (the 6-digit code is checked with `challengeAndVerify`).

### Development-only bypass (called out on purpose)
- `DEV_ADMIN_BYPASS_EMAIL` lets the admin area open on a development computer with no Supabase. It works **only** when `NODE_ENV` is `development` (a unit test proves it is refused in production and test), only for an email that has an active admin profile, and the fresh-2FA code in this mode is `000000`. A test also checks that only two source files read the variable. **Leave it empty on every real server.**
- **Test owner account:** the end-to-end tests create ONE profile with role **owner** and the email `zolb-test+owner@example.com` in the **local test database only**. `pnpm e2e:clean` removes it. A search for `zolb-test` in requests, admin profiles, email log and settings found 0 rows at the end.

### Decisions and assumptions to confirm
- Who may verify payments is still an open question. Both owner and staff can for now. It is one line (`PAYMENT_VERIFY_ROLES` in `admin-core.ts`).
- Staff can edit services, checklists and site content. Only the owner can edit file settings, payment methods, admin users and export. (Assumption.)
- The fresh 2FA code is a field inside each risky form, not a pop-up dialog. Same safety, fewer screens.
- The **9th status** `payment_verified` now has a PROVISIONAL badge (success colors) because the admin area must show it. The owner still decides the final look.

---

## Phase 6 report

### What is done
- **Email sender** (`src/server/email`): Brevo v3 REST API with plain `fetch` and no SDK. It never throws, and it never puts the API key in an error or in the body. Templates are plain functions. **Everything a client typed is HTML-escaped**, and new lines are removed from subject lines.
- **Emails:** new request (to the admin inbox: service and client name only, no documents, no phone), request received (to the client, with the tracking code), status changed and client message (to the client), payment submitted (to the admin), payment method changed (to every active owner), contact form (to the admin, reply-to is the client).
- **`email_log`:** every send is saved with status, Brevo message id and a short error. Today's count is checked against the 300 per day limit (the 301st is not sent). A failed email **never breaks** the main action. The admin request page has an **Emails** section with "Email not sent" and a **Retry** button (request emails only, rebuilt from the database).
- **Contact form** now sends: honeypot, Turnstile, 5 per hour per visitor, Zod on both sides. If sending fails, the client sees the Messenger and Viber links.
- **Tracking** `/track`: code and last 4 digits, Turnstile, 10 tries per 15 minutes per visitor, the **same message** for a wrong code and wrong digits, and a lock after 5 wrong tries for 15 minutes (the 6th try is refused even with the right digits). The lock is exact (each wrong try is one row, so the 15 minutes slide) and works the same for codes that do not exist, so nobody can learn which codes exist.
- **Tracking result** `/track/result` shows only: service name, status, timeline, our message to the client, and a payment summary. A test checks the object has exactly those 8 fields and contains none of: file names, email, phone, reference, amount, internal notes. The session lasts 1 hour and belongs to one request.
- **Pay now** (statuses Submitted, Under review, Waiting for client) and **Upload more documents** (Waiting for client only) reuse the Phase 3 and 4 pages. A visitor from the tracking page sees no step bar, no earlier files, no Remove button, and goes back to the tracking page after paying. Paying tells the admin by email.
- **Tests:** 293 unit tests (all pass), including: Brevo request shape, escaping, log rows, the daily limit, failure does not throw, retry, the lockout (5 wrong tries, 6th refused, exactly 15 minutes, nonexistent codes, sliding window, right answer clears) and the minimal view. 61 Playwright tests pass on phone and desktop (the whole project so far).

### NOT verified here (needs your accounts)
- **Real emails.** I could only test with a fake Brevo. Not checked: a real send, the **verified sender or domain** (SPF, DKIM, DMARC), and the goal "emails arrive in Gmail inbox, not spam, for all templates". Please test all 7 templates with a real Brevo key and a Gmail address.
- The real **Cloudflare Turnstile** widget (the server check is unit tested with a fake Cloudflare).
- "After 5 wrong tries, locked 15 minutes" on a real phone.

### Notes
- The database columns \`requests.tracking_failed_attempts\` and \`tracking_locked_until\` (DATABASE.md) are **not used**. The lock uses \`rate_limits\` rows instead, so it also works for codes that do not exist. They can be removed in a later migration if you agree.
- Email needs \`BREVO_API_KEY\`, \`EMAIL_FROM_ADDRESS\`, \`EMAIL_FROM_NAME\` and \`ADMIN_NOTIFY_EMAIL\` (all in \`.env.example\`). Without a key, emails are logged as failed with a clear note, and the app keeps working.
- The status emails go out for: Waiting for client, Payment verified, In progress, Completed, Cancelled. Submitted and Under review are quiet unless a message is written. (Assumption. One list in \`send.ts\`.)

---

## Phase 7 report

### What is done
- **Security headers** (`src/lib/security-headers.ts`, used by `next.config.ts`): Content-Security-Policy (only jsDelivr for the receipt reader, Cloudflare for Turnstile, and your Supabase for QR pictures), `frame-ancestors 'none'` and `X-Frame-Options`, `nosniff`, referrer policy, permissions policy, HSTS (production only). Checked three ways: unit tests, a browser test that visits 13 pages and records **zero CSP violations**, and a **production build** whose headers I read with curl.
- **Found by that check:** the server checked the Turnstile spam test **before** the form, so a typo wasted the single-use token. The field checks now come first (request and contact forms). Also, a client who chose the receipt picture before the page finished loading was left with a disabled button: the form now picks up an already-chosen file.
- **Production-mode run** with Cloudflare's published test keys: the real Turnstile widget loads under the CSP, the server check passes, and the payment flow, manual entry and OCR all work (zero CSP violations).
- **Cleanup job** (`src/server/jobs/cleanup-core.ts`, run by `pnpm job:cleanup`): deletes files of Completed or Cancelled requests after N days, unsent drafts after 7 days with their files and payments, old rate limit rows, and activity log rows older than 1 year. **Storage first, database second**: if storage fails nothing else changes, and the next run finishes the job. 10 tests prove it deletes the right files and only those (including the 29 and 31 day edge, other statuses untouched, a retention setting change, a storage failure then recovery, and running twice).
- **Keep-alive job** (`pnpm job:keep-alive`, run on the test database).
- **GitHub Actions:** \`scheduled-jobs.yml\` (cleanup daily, keep-alive every 3 days, run by hand too), \`backup.yml\` (optional weekly dump, OFF until you turn it on, private repo only), \`e2e.yml\` (browser tests by hand), a \`pnpm audit\` job in CI, and \`dependabot.yml\`.
- **Project rules as tests** (\`project-rules.test.ts\`): every file in \`src/server\` starts with \`import "server-only"\` (a short allow-list for files the Node scripts need), no client component imports server code, only 3 \`NEXT_PUBLIC_\` variables exist and none is a secret, \`.env.example\` lists every variable the code reads, no host-only APIs.
- **Delete client data** (the privacy right in SECURITY_AND_PRIVACY.md that was still missing): owner only, fresh 2FA, typed DELETE, logged. Deletes files, clears name, email, phone, messages and notes, keeps a minimal record. The request can no longer be tracked. 4 tests.
- **Docs:** \`docs/SECURITY_CHECKLIST.md\` (every item with a status and its proof), \`docs/OWNER_GUIDE.md\` (plain-English guide for the owner), README updates.
- **Tests now:** 321 unit tests and 68 Playwright tests (67 pass, 1 is phone-only on desktop).

### NOT done here (honest list)
- **Production deploy, custom domain, Brevo domain (SPF, DKIM, DMARC), Netlify credit use for a test week.** These need your accounts. Nothing was deployed.
- **The owner completing a real test request on her phone.** Needs the live site.
- **Owner review of the privacy notice text.** It is still a draft.
- **GitHub workflows have not run on GitHub.** I checked the YAML by eye only (and the scripts run on the test database).
- **Screenshots in the owner guide.** The guide says to add them (fake data only).
- **The ticks in the security checklist marked 🟡 or ⬜** (see the file). Notably: the real Supabase login and 2FA, the private bucket, no public sign-up, GitHub secret scanning, real emails not going to spam.

### Decisions
- Scripts use \`'unsafe-inline'\` in the CSP (Next.js inline scripts). A nonce would make every page dynamic and cost Netlify credits. Everything else in the CSP is strict. See the decision table.
- Old QR files are kept forever (a few KB each), not deleted after 30 days.

---

## Phase 8 report

### What is done
- **Case study page** at `/case-study` (in this app): the problem and the people, the constraints ($0, slow data, privacy), an architecture diagram (SVG with a text description for screen readers), 8 key decisions with their trade-offs, the security story (QR swap, private files, tracking design), the receipt reader story, screens, how it was checked, what I learned, and what I would do next. The content and the numbers are in `src/content/case-study.ts` with an "as of" date.
- **Screenshots** are made from the running app with **fake data only** (`pnpm screenshots`, six JPEG files of 29 to 66 KB in `public/case-study`). I looked at the admin and receipt pictures: only made-up names, a "SAMPLE - not real" account, and a fake QR. The browser test also checks that no test names appear on the page.
- **The page is not indexed and not linked** from the menu or the sitemap, because it shows the owner's business. The owner must approve it first. README links to it.
- **Honest numbers:** the OCR speed (2 to 3 seconds) and size (4.2 MB) are labeled as measured with a **synthetic** receipt. There are **no accuracy numbers**, and the page says so, because no real receipts were collected.
- **Tests:** a browser test for the page (sections, honest note, every picture loads, noindex, no test names).

### Needs the owner
- Approve the page (it names her business and shows the product) before it is linked or indexed. To publish: remove `robots` from the page metadata and add a link.
- Real receipts to fill in the OCR accuracy numbers.

---

## Risks to watch

- **Netlify free plan is a hard limit (300 credits/month).** When credits run out, the site is paused until next month. A production deploy costs about 15 credits. Keep production deploys few. Check usage weekly.
- **Supabase free projects pause after 7 days with no activity.** The weekly keep-alive job prevents this.
- **Supabase free plan has no backups.** The CSV export and an optional weekly `pg_dump` job are our backup.
- **Brevo free plan: 300 emails per day.** Plenty for this business, but we log every email so we can see the count.
- **GitHub disables scheduled workflows in public repos after 60 days with no commits.** We will add a reminder in the admin dashboard if the last cleanup run is too old.

---

## Session notes

### 2026-11-06 — Planning
- Read current official docs for Next.js, Supabase, Drizzle, Tesseract.js, Brevo, Turnstile, Netlify.
- Wrote all planning docs.
- Waiting for approval.

### 2026-11-06 — Phase 1 (foundation, database, design system)
- Read all docs first. Built Phase 1 only. Did not start Phase 2.
- Found two problems while working: the shadcn CLI tried to install a package named `cn` (removed), and the already-running dev server served an old layout until it was restarted.
- A test caught a real bug in my first version of the `payment_methods` log trigger (it never skipped empty updates). Fixed and tested.
- Waiting for approval.

### 2026-11-06 — Phase 2 (public pages)
- Built Phase 2 only. Did not start Phase 3.
- Lighthouse found a heading order problem, a logo link label that did not match its visible text, and missing head tags on the service page. All fixed.
- Found that a hook in the header blocked prerendering on dynamic pages. Fixed with Suspense and a fallback header.
- Waiting for approval.

### Phase 3 session
- Built Phase 3 and committed it. See "Phase 3 report" above.

### Phase 4 session
- Built Phase 4 and committed it. See "Phase 4 report" above.

### Phase 5 session
- Built Phase 5 and committed it. See "Phase 5 report" above.

### Phase 6 session
- Built Phase 6 and committed it. See "Phase 6 report" above.

### Phase 7 session
- Built Phase 7 and committed it. See "Phase 7 report" above.

### Phase 8 session
- Built Phase 8 and committed it. See "Phase 8 report" above.

### UI fixes session (buttons, "Questions?" section, footer)
- **Orange buttons:** one shared style, the `accent` variant in `src/components/ui/button.tsx`. New tokens `--cta` #C2410C, `--cta-hover` #9A3412, `--on-cta` off-white #FFF7ED (4.8:1 on #C2410C, 6.9:1 on #9A3412; changed from white on request) (in `globals.css`, listed in `docs/DESIGN_SYSTEM.md`). Weight 600. Focus ring is the brand ring. Contrast: white on #C2410C is 5.18:1, on #9A3412 is 7.31:1, ring on white 7.33:1. All orange buttons (nav, hero, how-it-works, service page, mobile menu) already used this variant, so no other change was needed.
- **Contact buttons:** new `components/shared/contact-buttons.tsx` (Contact us, Messenger, Viber; each hidden when its setting is empty; stacked full width on phones). `BackupContactBlock` now uses it (keeps its label for the other pages). New `contactChannelSentence()` in `lib/contact-links.ts` (with tests) builds "You can also write to us on Viber." from the channels that are set.
- **Home "Questions?":** text on the left, buttons on the right in one row; the "Need help? Message us directly." label is removed here.
- **Footer:** `grid-cols-1 md:grid-cols-3`, three equal columns (logo + name + payment note / Pages / Contact with the label and the same buttons), same heading style. Privacy notice and Terms of service moved to a thin bottom row with the copyright text (`LEGAL_NAV` in `site-nav.ts`). The copyright has no year, so it never goes out of date.
- **Viber is not a real button:** an earlier change that was not yet committed (still in the working tree) shows Viber as a number because the viber:// link did nothing on many devices. I kept that. It has the same size and shape as the buttons but is not clickable.
- **Checked:** screenshots at 390, 768 and 1440 px (no sideways scroll). Known small issue: at 768 px the Viber number wraps to two lines in the narrow footer column. `typecheck`, `lint` and the unit tests for contact links pass. Not run: the Playwright e2e suite.
- No test accounts were created and no database was written, so there is nothing to clean up.
- **Button color changed again (owner's choice):** background back to the original coral `--cta` #FF7B47 (hover #F0652F), text stays off-white #FFF7ED. Contrast is 2.4:1 at rest and 3.0:1 on hover. This is below the 4.5:1 rule; the owner chose it knowingly. Darker oranges that pass (for example #CA450D, 4.5:1) were offered. The earlier #C2410C numbers above no longer apply.
- None of this session's work was committed or pushed when this was written, so Vercel production still showed the old design.
- **Footer is now two columns (owner request):** the Contact column (Contact us + Viber buttons) was removed because the home "Questions?" section shows the same buttons. Footer = business info | Pages, from md up (`md:grid-cols-2`); the bottom row (copyright, Privacy notice, Terms of service) is unchanged. `SiteFooter` no longer takes Messenger/Viber props. Other pages still show their own contact block, and "Contact" stays in Pages. Checked at 390, 768 and 1440 px (no sideways scroll).
- **Footer Pages links fill their column (owner request):** the four links were stuck at the left of the right half, leaving a blank space. Now one per line on phones, 2 by 2 from md, and one row spread edge to edge from xl (1280 px), with no wrapping. Checked at 390, 768, 1024 and 1440 px (no sideways scroll); looked at the 390, 768 and 1440 px footers.
