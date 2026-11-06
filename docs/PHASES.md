# PHASES.md

Build in small phases. **Stop at the end of each phase and wait for approval.** Update PROGRESS.md after each phase.

Each phase has: Goal, Tasks, Done when.

---

## Phase 1 — Foundation and database

**Goal:** An empty but solid project that builds, connects to the database, and deploys.

Tasks:
- Re-check versions and free limits (official pages). Write exact versions in PROGRESS.md.
- Create Next.js 16 app (TypeScript strict, App Router, `src/` folder).
- Add Tailwind CSS, shadcn/ui, Zod, ESLint, Prettier, Vitest, Playwright.
- Create Supabase project (region near PH). Turn off public sign-up. Lock down the Data API.
- Drizzle schema for **all tables** in DATABASE.md, first migration, RLS on (no policies), activity_log trigger.
- Create both storage buckets (`client-files` private, `public-assets` public read).
- `src/server/db/client.ts` with pooled URL and `prepare: false`.
- Seed script: services (names only, from the brief), **empty** checklists, default settings, first owner account.
- `.env.example` with every variable and a comment.
- CI workflow: lint, typecheck, unit tests.
- `netlify.toml`, connect repo, one deploy preview to prove the host works.
- `src/lib/status.ts` status rules + tests.

Done when:
- [ ] `npm run dev`, `lint`, `typecheck`, `test` all pass.
- [ ] Migration runs on a fresh Supabase project.
- [ ] A test proves the public Supabase key cannot read any table.
- [ ] Netlify deploy preview shows a "Hello" page that reads one setting from the database.
- [ ] No secrets in Git.

---

## Phase 2 — Public pages with seed content

**Goal:** All public information pages, fast on phones, content from the database.

Tasks:
- Layout: header, footer, mobile menu, backup contact block.
- Pages: Home, Services, Service detail (with empty-checklist message), How it works, Contact (form UI only — sending comes in Phase 6), Privacy notice.
- Basic design tokens in Tailwind (from DESIGN_HANDOFF.md, or temporary ones until the design is ready).
- SEO basics: titles, descriptions, Open Graph image, sitemap, robots.txt.
- Error page and 404 page with Messenger/Viber links.

Done when:
- [ ] All pages work on a 360 px wide screen.
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95.
- [ ] No government logos. No invented requirements or fees.
- [ ] Content changes in the database show on the pages.

---

## Phase 3 — Request flow and file upload

**Goal:** A client can create a draft, get a tracking code, upload documents, and submit.

Tasks:
- Turnstile verify helper + Postgres rate limiter + tests.
- Step 1 form (service, contact, consent) → Draft + tracking code + draft cookie.
- Tracking code generator + tests (format, alphabet, uniqueness retry).
- `requireRequestAccess()` + tests (wrong cookie, expired, wrong request, wrong status).
- Browser image compression.
- `POST /api/upload`: magic-byte check, size, count, storage cap, random path, DB row.
- Remove file (Draft only).
- Submit step (without payment for now) → status Submitted.

Done when:
- [ ] Full flow works on a phone on throttled "Slow 4G".
- [ ] A renamed `.exe` → `.jpg` is rejected by the server.
- [ ] Files appear in the private bucket with random names; public URL does not work.
- [ ] Access tests pass: another browser cannot upload to someone else's request.
- [ ] Rate limits and Turnstile block repeated submits.

---

## Phase 4 — Payment QR page and receipt OCR

**Goal:** Client sees QR codes, reads the receipt with OCR (or types), and submits payment values.

Tasks:
- Seed payment methods (GCash, Maya, BDO) with placeholder QR images marked "SAMPLE — not real".
- Payment step UI: QR, account name, number, copy/save buttons, "Skip for now".
- OCR engine (`src/ocr/engine.ts`): lazy load, two passes, time limit, cleanup.
- Parsers for GCash, Maya, BDO with placeholder patterns + shared helpers + fake-sample fixtures + unit tests.
- Receipt form: image preview, editable fields, confidence labels, confirm checkbox, manual fallback.
- `savePayment` Server Action with all server checks.
- Measure OCR download size and time; write it in OCR_PAYMENTS.md.

Done when:
- [ ] Parser and helper tests pass.
- [ ] Network tab shows the receipt image is **never** sent.
- [ ] Duplicate reference per method is rejected with a clear message.
- [ ] Manual entry works with OCR turned off.
- [ ] OCR works on one Android and one iPhone.

---

## Phase 5 — Admin area

**Goal:** Owner and staff can log in safely and manage everything.

Tasks:
- Supabase Auth login, forced TOTP setup, AAL2 check, `requireAdmin()` + tests.
- Dashboard (counts, needs-action list, storage meter, job times).
- Request list with filters, request detail, signed file links, notes/messages, status changes.
- Payment verify/reject with the warning box and checkbox.
- Settings: payment methods (owner only, fresh 2FA for risky fields), services + checklists, site content, file settings.
- Admin users (invite, role, turn off).
- Activity log page.
- CSV export (requests, payments) with formula-injection protection.

Done when:
- [ ] Permission tests pass: staff cannot edit payment methods; logged-out and non-2FA sessions are blocked on every admin action (not just pages).
- [ ] QR change without a fresh 2FA code is refused.
- [ ] Every action in the "log these" list appears in the activity log.
- [ ] Owner can do every daily task on a phone.

---

## Phase 6 — Emails and tracking

**Goal:** Emails go out, and clients can track their request.

Tasks:
- Brevo account, verified sender/domain (SPF, DKIM, DMARC if we have a domain).
- `brevo.ts` sender + templates + `email_log` + retry button.
- Emails: new request (admin + client), status change, client message, payment submitted, payment method changed alert, contact form.
- Tracking page: code + last 4, Turnstile, rate limits, lockout, minimal view, "Pay now", "Upload more" (Waiting for client only).
- Payment from tracking page (reuses Phase 4 components).

Done when:
- [ ] Emails arrive in Gmail inbox (not spam) for all templates.
- [ ] Failed email does not break the main action and shows "Retry" in admin.
- [ ] Tracking shows no files, no email, no full phone.
- [ ] After 5 wrong tries, the code is locked for 15 minutes (the 6th try is refused even if correct).

---

## Phase 7 — Security hardening, tests, deploy

**Goal:** Ready for real clients.

Tasks:
- Security headers (CSP, HSTS, frame-ancestors, referrer policy).
- GitHub Actions scheduled jobs: keep-alive and cleanup (+ optional backup).
- Draft expiry and file retention cleanup tested on a test project.
- Playwright end-to-end: full request flow, tracking, admin verify payment.
- Go through every item in SECURITY_AND_PRIVACY.md and tick it.
- Owner reviews privacy notice text.
- Production deploy, custom domain (if any), Brevo domain set up.
- Short "How to use" guide for the owner (plain English, with screenshots).

Done when:
- [ ] All tests pass in CI.
- [ ] Security checklist fully ticked.
- [ ] Cleanup job deletes the right files and only those (proved with test data).
- [ ] Owner completes one real test request from start to finish on her phone.
- [ ] Netlify credit use for the test week is written in PROGRESS.md.

---

## Phase 8 — Portfolio case study page

**Goal:** A page (in this app at `/case-study` or on the developer's portfolio site) that explains the project.

Tasks:
- Problem, users, constraints ($0, slow data, privacy).
- Architecture diagram and key decisions (from ARCHITECTURE.md and the decisions log).
- Security story: QR swap protection, private files, tracking design.
- OCR story: in-browser, no image stored, parser design, accuracy numbers.
- Screenshots with **fake data only**.
- What I would do next / lessons learned.

Done when:
- [ ] No real client data in any screenshot or text.
- [ ] Owner approves the page (it shows her business).
- [ ] Link from README.
