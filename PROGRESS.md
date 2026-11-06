# PROGRESS.md

Update this file at the end of every work session.

**Current status:** Phase 4 (payment QR page and receipt OCR) is finished and committed. Work continues with Phase 5 (admin area).
**Last updated:** 2026-11-06

**Next step:** Phase 5: admin area.

---

## Phase checklist

Details for each phase are in `docs/PHASES.md`.

- [x] Phase 0 — Planning docs
- [~] Phase 1 — Foundation and database (code done; hand steps and approval pending)
- [~] Phase 2 — Public pages with seed content (code done; approval pending)
- [x] Phase 3 — Request flow and file upload(code done, checked on this computer)
- [x] Phase 4 — Payment QR page and receipt OCR(code done, checked on this computer)
- [ ] Phase 5 — Admin area
- [ ] Phase 6 — Emails and tracking page
- [ ] Phase 7 — Security hardening, tests, deploy
- [ ] Phase 8 — Portfolio case study page

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

---

## Open questions

1. Does the business have its own domain name (for example `rgbookkeeping.ph`)? This decides the email sender address and the website address.
2. Should staff accounts be able to verify payments, or only the owner?
3. Public site language: English only, or English + Filipino?
4. Starting values: how many days to keep files after Completed/Cancelled (proposal: 30), and max files per request (proposal: 15)?
5. Will the GitHub repository be public (for the portfolio) or private?
6. **9th status.** DATABASE.md has 9 request statuses (the extra one is `payment_verified`). FEATURES.md and DESIGN_SYSTEM.md list 8. Should `payment_verified` be its own status, and what color and icon should its badge have? (The badge has a TODO in `src/components/shared/status-badge.tsx`.)
7. **npm or pnpm?** CLAUDE.md says npm, but the project uses pnpm. Which one do you want? (I used pnpm and did not change CLAUDE.md about it.)
8. **Service names.** PHASES.md says the seed uses service names "from the brief", but the brief is not in the repository. `scripts/seed-data/services.ts` is empty. Please give me the list of names (names only, no fees or requirements).
9. **Palette.** Teal Ledger (default now) or Harbor Navy? (Also asked in DESIGN_SYSTEM.md section 8.)
10. **Tracking code font and font weights.** DESIGN_SYSTEM.md asks: is system monospace OK for the tracking code, and are weights 400 and 700 only OK? I built it that way.
11. **Staff and payments** (same as question 2). Not decided. It matters in Phase 5.
12. **Phone input and money input** have a prefix box (+63, peso sign) but no number rules yet. The rules come with the request form in Phase 3.
13. **Privacy notice facts.** The draft needs: how long to keep the text records of requests, the data region (where Supabase stores data), the contact person and details, and a check by you or a lawyer. See `src/content/privacy-notice.ts`.
14. **Dead links for now.** "Start a request" and "Track my request" point to `/request` and `/track`, which are built in Phases 3 and 6. Until then they show the 404 page. Is that OK, or do you want a small "coming soon" page?
15. **Contact page details.** Phone, email, address, hours, Messenger and Viber all come from the database settings and are empty now. The owner fills them in the admin area (Phase 5). Until then only empty states show.
16. **Turnstile.** The contact form has no spam-check area yet. It is added together with sending, in Phase 6.

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
