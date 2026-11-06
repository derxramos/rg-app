# PROGRESS.md

Update this file at the end of every work session.

**Current status:** Phase 1 code is finished and checked on this computer. Waiting for owner approval. Some Phase 1 steps need your accounts (Supabase, Netlify): see "Phase 1: what you must do by hand".
**Last updated:** 2026-11-06

**Next step:** Owner tests Phase 1, runs the hand steps, and answers the open questions. After approval, start Phase 2 (public pages).

---

## Phase checklist

Details for each phase are in `docs/PHASES.md`.

- [x] Phase 0 — Planning docs
- [~] Phase 1 — Foundation and database (code done; hand steps and approval pending)
- [ ] Phase 2 — Public pages with seed content
- [ ] Phase 3 — Request flow and file upload
- [ ] Phase 4 — Payment QR page and receipt OCR
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
