# PROGRESS.md

Update this file at the end of every work session.

**Current status:** The roles, accounts table and 2-step login recovery work is built on `feat/roles-accounts-recovery` and merged into `main` (not pushed, nothing run on a live database): see "Roles, accounts table and 2-step login recovery" below. All 8 original phases are built and each is committed. The accounts and roles work (branch `feat/auth-roles`, merged into `main`, not pushed) is built too: see "Accounts and roles work" below and docs/AUTH_AND_ROLES.md. The live checks with real accounts (Supabase, Brevo, Turnstile, Netlify, GitHub), the owner review of the privacy notice, and the owner approval of the case study are still open. See docs/SECURITY_CHECKLIST.md.
**Last updated:** 2026-11-09

**Next step:** Owner: answer the open questions, set up the real accounts, and run the live checklist. Then deploy a preview.

---

## Payment methods: delete from the list, and bulk delete (branch `feat/payment-methods-delete`, 2026-11-09)

- **Why:** to delete a method the Admin had to open it and scroll to a Delete card. Delete is a list task, so it is now on the list, the same way as the Services list.
- **List screen** (`src/components/admin/payment-methods-list.tsx`): a checkbox on every card, "Select all", a selection bar ("2 methods selected", Clear, Delete selected), a visible Turn on/off button, and an Actions menu (Move up, Move down, Delete). Deleting asks to confirm in a window that lists the names and says which one will be kept ("used by N payments"), and needs the fresh 2FA code.
- **Server** (`deletePaymentMethods` in `src/server/services/admin-settings.ts`, `deletePaymentMethodsAction`): admin and owner only (`payment_methods.manage`), fresh 2FA code, 1 to 100 ids, one transaction. A method that payments used is kept and named in the answer, and does not block the others. A missing id is reported, not an error. Each delete is written to the activity log by the app (`payment_method.deleted`, name, bulk or not) and also by the database trigger with the real row. The old single delete (`deletePaymentMethod`) and the Delete card on the edit page stay as a second way.
- **Staff:** unchanged. They cannot open Payment methods.
- **Tests:** unit test for the bulk delete (staff refused, fresh code needed, bad and too many ids, used method kept, admin can do it, activity log rows for the app and the trigger, an already deleted id). Browser tests (phone and desktop): delete one from the menu, delete several with a used method kept, Select all and Clear.
- **Checked:** lint, type check, 814 unit tests, layout test (the page was already in it), production build, and screenshots at 1280 and 360 px (light and dark).
- **Build note:** the production build on the local test database (PGlite, one connection) fails often with "bind message" or "ECONNRESET" because the build workers share that one connection. It passed when the build was limited to one worker (`experimental: { cpus: 1, staticGenerationMaxConcurrency: 1 }` in `next.config.ts`, used only for that run and not committed). Real Postgres does not have this limit.
- **Test data:** only the local test database was used. Test methods ("Test list ... (e2e)") and test activity rows were removed.

## Loading: two layers instead of three (branch `fix/loading-two-layers`, 2026-11-09)

Only styling and loading placeholders changed. No feature, permission or data change.

- **Problem:** a click on a menu item showed three loading signals at the same time: a teal bar, a "Loading..." pill, and a spinner with "Loading..." and gray blocks in the page. Together with the first-load frame that made three loading screens.
- **Rule now: two layers.**
  1. *First load or hard refresh:* `AdminShellSkeleton` (the real frame as placeholders). Unchanged.
  2. *A click on a menu item or link:* ONE thin top bar (`navigation-progress.tsx`) plus a gray shape of the page that is coming (`loading.tsx`). No spinner and no "Loading..." text.
- **Top bar:** 3 px, starts at once (no delay, because feedback to a click must feel instant), rushes to 60 %, then creeps toward 92 % while the server answers, then fills up and fades out when the new page arrives (400 ms). It only uses `scale` and `opacity`, so it runs smoothly. With "reduce motion" it is a still bar. A screen-reader-only "Loading page" is announced. The click and form logic (`src/lib/nav-progress.ts`) is unchanged.
- **Page shapes** (`src/components/admin/page-skeletons.tsx`): Dashboard (also the default), List (Requests, Activity, Admin users, Services, Payment methods), Card grid (Settings), Detail (one request), Form (site content, file settings, edit service, edit payment method). Each folder has a small `loading.tsx` that picks its shape. They still wait 200 ms before they fade in, so a fast page shows only the bar.
- **Dev preview:** `/dev/loading` (admin frame) and `/dev/loading?shapes=1` (all shapes). Both are 404 in production.
- **Test:** `tests/unit/admin-loading.test.ts` was rewritten for the new rule (no visible "Loading..." text or spinner, one announcement per shape, the delay class, every folder has its `loading.tsx`).
- **Checked:** lint, type check, 812 unit tests, production build, and the layout test. Watched a real click in a browser with a slowed server: the bar starts within 80 ms and keeps moving. The page shapes were checked on the preview page at 1280 and 360 px. The browser checks used a test owner on the local test database only; test data was removed.
- **Not checked:** the exact moment when a real database query is slow on the live site. The slowed-server test holds back the whole answer, so it shows the bar but not the gray shapes together. The shapes are the normal Next.js loading files, so they show as soon as the first part of the page is sent.

## Loading screen on a hard refresh (branch `fix/loading-skeleton`, 2026-11-09)

Only styling and loading placeholders changed. No feature, permission or data change.

- **Problem:** on a hard refresh (F5) of an admin page, the first thing on screen was one lone gray bar on a blank page. It came from the outer loading fallback in `src/app/admin/(protected)/layout.tsx`, which is shown while the server checks who is signed in.
- **Fix 1, show the frame at once:** new `AdminShellSkeleton` (`src/components/admin/admin-shell-skeleton.tsx`) has the same header (with the logo), sidebar, page padding and phone bottom bar as the real admin shell. Only the parts that depend on the person are placeholders.
- **Fix 2, shapes that match the page:** the placeholders look like the real page (title, intro, five status cards, a list). The request-step placeholder (`FlowSkeleton`) now has the step bar, heading, help line, form card and a button.
- **Fix 3, no flash on a fast load:** every placeholder (and the spinner in the admin `loading.tsx`) stays invisible for 200 ms, then fades in (`--animate-skeleton` and `--animate-delayed-in` in `globals.css`). A fast page shows no gray at all.
- **Fix 4, a gentle shimmer:** a slow light band moves over the placeholder. With "reduce motion" there is no shimmer, only the delayed fade.
- Development-only preview: `/dev/loading` (404 in production).
- **Checked:** lint, type check, 808 unit tests, production build, and the layout test (no overflow). Looked at the frame at 1280 and 360 px, light and dark, right after load and after the delay.
- **Not changed:** the public pages already show the site header and footer while a step loads, so only the step content is a placeholder there. Pages that can be built ahead of time already arrive as full HTML.

## Card, pill and button overflow fix (branch `fix/card-overflow`, 2026-11-09)

Only layout and styling changed. No feature, permission or data change.

**How it was checked.** A layout checker (`tests/e2e/layout-audit.ts`) runs inside the page and looks for: (a) the whole page scrolling sideways, (b) a box or its text going outside its card or container, (c) two siblings overlapping, (d) text cut off by accident, (e) tap targets under 44 px on phones. It also lists "..." cut-offs that have no tooltip. `tests/e2e/layout.spec.ts` runs it on every public page, the signed-in pages and the request steps, the tracking result, and every admin page, with long test data (a 60 character name, a 50 character email, the longest service name, 12,345 requests, a very long requirement label).
- Quick run (part of `pnpm test:e2e`, light mode): 360, 768, 1024, 1280, 1366, 1920 px, as Owner. Fails on types a, b, c, d.
- Full audit: `LAYOUT_FULL=1 pnpm exec playwright test layout --project=desktop` = 17 widths (320, 360, 390, 430, 600, 768, 820, 911, 1024, 1093, 1180, 1280, 1366, 1440, 1536, 1920, 2560), light and dark, as Owner, Admin and Staff. Optional: `LAYOUT_SHOTS=folder` saves pictures at 360, 768, 1280, 1920; `LAYOUT_REPORT=file.json` saves every problem.
- Browser zoom of 125 % and 150 % gives fewer CSS pixels, so it is the same as a narrower window. The widths 911 and 1093 (1366 px screen) and 1280 and 1536 (1920 px screen) cover it.
- The admin sidebar is fixed (256 px from 1024 px) and has no collapse button, so "collapsed" means the layout under 1024 px (no sidebar, bottom bar).
- To run the test on your computer it needs the local test database (`pnpm dev:db`) and a dev server started with the local database address. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `BREVO_API_KEY` and `ADMIN_NOTIFY_EMAIL` to empty for that server, so no real email is sent.

**Problems found (first run, before the fixes) and fixed**

| Page | Width | Problem | Cause and fix |
|---|---|---|---|
| Admin Dashboard | 1280 (and any content width of about 950 to 1050 px) | The "Payment submitted" pill stuck out of its card | Pill could not wrap and the 5-column grid followed the screen, not the content area. Pill now wraps (shared Badge), and the grid uses a container query: 2 columns, 3 columns from 640 px, 5 columns from 1100 px of content width (each card at least 210 px). |
| Every admin page | 768 | Header pushed "Security", theme and "Sign out" off the screen (page 968 px wide) when the name was long | The right side of the header had no `min-w-0`. The name now has a maximum width and a tooltip. |
| Every admin page | 320 | Header 16 px too wide | "Sign out" shows only its icon under 380 px (the words stay for screen readers). |
| Admin Request detail | 360 | "Record payment and mark as paid" button stuck out of its card | Shared Button now has `max-w-full`, so its words wrap. |
| Admin Request detail and other two-column pages | 320 | Content 8 px too wide | A `grid` without a first column made the column as wide as its longest word. All such grids now start with `grid-cols-1`. |
| Public service detail | 360 | Page 411 px wide with a long requirement label | Same grid cause, plus long words now break inside the requirement card. |
| Public Auth error and admin "Not allowed" | 768 and up | Three buttons wider than the box | The button row now wraps (`sm:flex-wrap`). |
| Admin Services (phone cards) | 320 | Long service name squeezed by the checkbox and the actions button | The actions moved to the second row with the fee and the badge. |
| Admin Services table | 1180 | Select-all checkbox wider than its column | First column 6 % to 8 %. |
| Admin Services table, header name, account menu | all | Shortened text ("...") without a tooltip | Full text is now in a `title` tooltip. |
| Admin Users | all | A hand-made "You" pill at 12 px | Now the shared Badge (14 px). |

**Shared parts (the fix is in these, not page by page)**
- `Badge` (`src/components/ui/badge.tsx`): `max-w-full`, label wraps, icon stays beside the first line, long words break. `StatusBadge` and every other pill use it.
- `Card` (`src/components/ui/card.tsx`): `min-w-0` and `overflow-wrap: anywhere`.
- `Button`: `max-w-full`.
- `StatCard` and the dashboard grid: equal heights, no empty label line.

**Result of the final audit run:** 0 problems of types a, b, c, d, 0 "..." cut-offs without a tooltip and 0 tap targets under 44 px, on all pages above, 17 widths, light and dark, Owner, Admin, Staff. Screenshots of the Dashboard, Admin users, Requests, Settings, Home, Services and the payment step were looked at (360, 768, 1280, 1920; light and dark; a sample of them by eye, the rest by the script).

**Checks:** lint OK, type check OK, 808 unit tests OK, production build OK. Browser tests: 78 passed, 20 failed. All 20 failures are admin screens that redirect to `/login` when the tests run in this setup (the same tests fail on `main` too, checked with `admin.spec.ts` and `accounts-table.spec.ts`), so they are not caused by this branch. The new layout test passes.

**Left open / notes**
- Loading screens (`loading.tsx`) were not run through the checker, because they show for a moment only. Their markup uses the same Card and grid classes.
- Counts show as `12345` (no thousands comma). That is a text format change, not layout, so it was left alone.
- Text that is 30 % longer than English was tested only through the long test data above (there is no Filipino text in the app yet).
- The first full run of the browser test suite used the live Brevo key from `.env.local`, so it may have sent a few real emails (to `zolb-test+...@example.com` addresses and possibly to the admin notify address). Later runs used empty email variables. All tests ran against the local test database, never the live one. Test data was removed (`pnpm e2e:clean`).
- Prettier still reports 3 old files (`contact-buttons.tsx`, `contact-links.ts`, `tests/unit/admin-improvements.test.ts`) that this branch did not touch.

## Admin uniform layout (branch `fix/admin-uniform-layout`, 2026-11-09)

Layout and table or card styling only. No feature, permission or data change.

- [x] One page frame in `AdminShell`: side padding 16 px (phone), 24 px (from 640 px), 32 px (from 1280 px); max width 1760 px, centered. No page sets its own width.
- [x] Forms are at most 720 px wide; two-column form layouts start at 1280 px (Site content, File settings, Payment method, Service edit, Security, Request details, Dashboard).
- [x] Settings cards: 1, 2, 3, 4 columns (from 640, 1280, 1536 px). Export card added for Owner and Admin (phone bottom bar has no room for Export).
- [x] Tables (Admin users, Requests, Activity, Services): table from 1180 px, cards below. No wrapped words, 16 px cell padding, left-aligned headers, long emails cut with "..." and a tooltip.
- [x] Admin users: Account column, short status labels with tooltips, "You" tag, three-dots actions (none on your own row).
- [x] Phone filters panel ("Filters" button), 10 rows on a phone, large Previous and Next buttons, bottom padding for the bottom bar and the safe area.
- [ ] Sidebar collapse: not built (optional, bigger change).
- [ ] Lighthouse before and after: NOT run. The dev server reloads itself in a loop (also on `main`), so Lighthouse cannot record a trace, and the test login only exists in development. Steps: deploy a preview, sign in as the owner, run Lighthouse (desktop, performance) on /admin/settings/users on `main` and on this branch, compare.
- Checks: lint, type check, 808 unit tests pass. `next build` compiles; the full build could not finish here because the local test database (PGlite, one connection) resets connections while pages prerender. `main` fails the same way. Run the full build once on Supabase or a preview.
- Screenshots: 748 page checks (3 roles x light and dark x 11 widths x 11 pages) were made. At every width all pages have the same left and right edge, no table has wrapped text, and the page never scrolls sideways (after one fix: Dashboard cards are one column below 480 px).
- Test data: temporary test accounts with the zolb-test+...@example.com pattern were made ONLY in the local test database, including an owner, an admin and a staff account. They were removed again (0 left). The live Supabase database was never used.
- Known, not fixed (outside this task): in `pnpm dev` the admin pages show a Next.js "uncached data ... outside Suspense" error and the browser reloads in a loop. It also happens on `main`.

---

## Before launch

- [ ] Set `ADMIN_REQUIRE_2FA=true` on the live site and test admin login.

---

## Accounts and roles work (branch `feat/auth-roles`)

Plan: user accounts (role `user`) and admin accounts (role `admin`). Phases:

- [x] Phase 0 — Git setup (deny rules in `.claude/settings.json`, Git rules in CLAUDE.md, branch made)
- [x] Phase 1 — 2FA flag hardening (red banner, startup warning, `checkAdmin` flag option, tests)
- [x] Phase 2 — Database: profiles, user_id, RLS, storage rules (migrations 0002 and 0003, NOT yet applied to the live database)
- [x] Phase 3 — Session layer and guards (the live redirect to /login is checked by hand after Phase 4)
- [x] Phase 4 — Login, register, verify, forgot and reset, sign out (live email flow to be checked by hand, see docs/AUTH_AND_ROLES.md section 2)
- [x] Phase 5 — Header and layouts (browser checks pass on phone and desktop with the dev test login)
- [x] Phase 6 — Requests belong to users (the old guest draft cookie code stays only for old guest drafts; they expire within 7 days)
- [x] Phase 7 — Account area (My requests, request page, profile, download my data, delete my account, privacy notice 2.0)
- [x] Phase 8 — Admin role management, docs and checklist (Make admin, Remove admin, docs/AUTH_AND_ROLES.md, manual test list)
- [x] Phase 9 — 2FA ON path (last) (tested for both flag values; the live check is in "Before launch")

Note: for this run the owner asked me to go on without stopping after each phase, and to stop only if blocked.

---

## Roles, accounts table and 2-step login recovery (branch `feat/roles-accounts-recovery`)

Plan approved on 2026-11-08. One role column for everybody: `user`, `staff`, `admin`, `owner` (see `src/lib/permissions.ts`).
Each phase ends with lint, type check, tests and build, then `git merge --ff-only` into `main`. Nothing is pushed. **Nothing was run on the live database.**

- [x] Phase 1 — Plan and data mapping (the owner runs the read-only query M1 before the migration, see below)
- [x] Phase 2 — Role model, permission function, database policies and triggers (migration `drizzle/0006_single_role.sql`, NOT applied anywhere live)
- [x] Phase 3 — Staff menu and page guards (the browser checks for staff come in phase 7)
- [x] Phase 4 — Accounts table and role dialog (the Reset 2-step login menu item is a disabled placeholder until phase 5)
- [x] Phase 5 — Backup device and reset by another person (the real Supabase calls are NOT run here: unit tests use fakes, see the report)
- [x] Phase 6 — RECOVERY.md and docs
- [x] Phase 7 — Final tests, lint, build

### Phase 2 report (2026-11-08)
- **Permission table:** `src/lib/permissions.ts` (`can(role, action)`). 136 unit tests: every role times every action. `OWNER_ONLY`, `PAYMENT_VERIFY_ROLES` and `hasRole` are gone (a test fails if they come back).
- **Checks in three places:** pages and actions (`guardPanelPage(action)`, `withPanel({ action })`, `requirePanel(action)` in `src/server/auth/panel.ts`), every service function (`assertCan`), and the database (`private.can()` for Row Level Security, plus triggers that read `app.actor_id`).
- **Database:** `admin_profiles` is removed. `profiles` now has `role` (new type `account_role`), `is_active`, `last_login_at`, `mfa_reset_required`, `sessions_revoked_at`. The last-owner rule is a trigger on `profiles`. `public.is_admin()` is replaced by `private.can()` (schema `private`, not exposed to the Data API). The snapshot and journal for 0006 are made by a script, and `drizzle-kit generate` reports "No schema changes".
- **Bug found by a test while building:** the guard triggers first ran as the signed-in client role, which cannot use the `private` schema, so a client could not even change their own name. The trigger functions are now `security definer`.
- **Bug fixed in passing:** `passwordIsRight()` signed the person out of ALL devices after a correct password (Supabase default scope is global). It now closes only its own throwaway session.
- **Fresh confirm, even with the flag off:** a risky action asks for the code of the person doing it (any of their devices). If the person has no authenticator yet (only possible while `ADMIN_REQUIRE_2FA=false`), it asks for their own account password instead. Wrong tries: 5 per 15 minutes. Before, the flag-off state skipped this step completely.
- **Sessions:** "turned off" and "signed out everywhere" (`sessions_revoked_at`) are checked on every admin request.
- **Local test accounts:** the browser tests still use ONE test account with the role **owner** (`zolb-test+owner@example.com`) in the LOCAL database only. No other test account was made in this phase.
- **Tests:** 705+ unit tests pass (new: `roles-db`, `accounts`, `permissions`). Build passes against the local test database (it needs `experimental.staticGenerationMaxConcurrency: 1` for that database, which I set only for the run and did not commit).

### Phase 3 report (2026-11-08)
- **Menu:** built from `can()` (`src/components/admin/admin-nav-items.ts`, tested per role). Staff see Requests, Services (opens `/admin/settings/services` directly, no Settings page) and Activity. Owner and admin see the full menu. The phone bar uses the same list (3 or 4 items). The header shows Owner, Admin or Staff.
- **Landing:** staff go to Requests after sign in, owner and admin to the dashboard. The public header "Admin" link follows the same rule.
- **Not allowed:** a page the role may not open goes to `/admin/not-allowed?reason=role`. A refused Server Action or route answers "You are not allowed to do this." Every refused try is written to the activity log as `access.denied` (who, action, where) in ONE place (`requirePanel`). A refusal inside a service (for example a staff fee change) is logged too.
- **Services pages for staff:** no fee field, no show/hide, no reorder, no payment QR choices, no Delete on checklist items. A new service made by staff starts hidden with no fee. The server refuses the same things if the form is replayed (tests), and so does a database trigger.
- **Requests page:** the "mark payment verified" controls show only for admin and owner (`payments.verify`). Staff can still view client documents (every open is logged as `file.opened`).
- **Found by the build:** a page that reads `?reason=` outside Suspense could not be prerendered. Fixed with a small Suspense block.
- Tests: 713 unit tests pass. Lint, type check and build pass (build against the local test database with one static worker, set only for the run).

### Phase 4 report (2026-11-08)
- **Settings > Admin users is now a table** (cards on a phone). Columns: Name, Email, Role, Status (Active, Turned off, Invited with temporary password, Email not verified), 2-step login (On or Off for staff, admin and owner), Joined, Actions. Search, role and status filters, rows per page (10, 25, 50) and the page number are all in the web address, and the SERVER does the work (`listAccounts`).
- **Actions menu** (new `dropdown-menu.tsx`): Change role, Reset 2-step login (placeholder), Turn account off or on, Resend invite. There is NO delete. A row you may not touch shows "–". Your own row never has actions. An admin sees no actions on an owner row (only an owner can change or turn off an owner).
- **Change role is ONE dialog:** choose the role, enter the code once: "Enter the 6-digit code from YOUR authenticator app." It is the code of the person making the change. With no authenticator yet (flag off) it asks for that person's own password instead. The old repeated dropdown and code box on every row are gone.
- **Invite** button (owner and admin): staff or admin, and owner only when an owner invites. Two ways: invitation email, or a temporary password (never saved or logged; the person must change it at the first sign in).
- **Turn off** also bans the login in Supabase, signs the person out everywhere, and works for clients too. Every role change, turn off and turn on writes to the activity log (who, whom, old and new value, time) and the affected person gets an email.
- **Found by the browser test:** every admin page was 10 px wider than a phone screen (the header logo line). The admin header now drops the small line under "RG'S" on a phone.
- **Browser tests (local database only):** 9 tests on phone and desktop pass (`tests/e2e/accounts-table.spec.ts`). They made 13 local test accounts with the markers `zolb-test+acc-NN@example.com`, **including accounts with the role staff and ONE with the role admin** (local database only), and removed them again with their activity rows.
- Tests: 719 unit tests pass. Lint, type check and build pass.

### Phase 5 report (2026-11-08)
- **Backup device (layer 1):** `/admin/mfa/setup` is now two steps: "Step 1 of 2: your authenticator app" and "Step 2 of 2: a backup device". Each device gets a name the person types. The page says the same QR code can be scanned on two phones. The admin area stays closed (`needs-mfa-setup`) until two devices exist. This applies to a first setup AND after a reset. The flag is `profiles.mfa_reset_required`: migration 0006 sets it for every staff, admin and owner account, and new panel accounts get it too. It only has an effect while `ADMIN_REQUIRE_2FA` is on.
- **Codes from any device:** at sign in, a code from ANY verified device is accepted (so the backup phone works).
- **Security page** `/admin/security` for every staff, admin and owner account (a "Security" link in the admin header; the staff menu stays Requests, Services, Activity): lists devices (name, date added), adds a device, and removes one only with a code from a DIFFERENT device. The last device can never be removed (the button is missing and the server refuses). Adding a device needs the higher level (a code typed at sign in), so a password alone cannot add an attacker's device.
- **Reset 2-step login (layer 2):** Settings > Admin users > Actions > Reset 2-step login. Owner and admin can reset staff, and each other (an admin may reset an owner; they still cannot demote or turn off an owner). The person doing it confirms with their OWN code (or password, see below) and types the other person's full email. The system: marks the account "set up again", signs the person out everywhere (`sessions_revoked_at`), removes all devices with the Supabase secret key (server only), writes `account.2fa_reset` to the activity log, and emails the person. **If the target is an owner, every active owner gets an email too.** Nobody can reset themselves.
- **Safe order:** the database change (forced setup, signed out) happens BEFORE the devices are deleted, so a Supabase error half way still leaves the account locked down.
- **Flag off, no authenticator yet:** the confirm asks for the person's own account password (see phase 2). Reset still works. While the flag is off the setup is not forced; the red banner and the "Before launch" item stay.
- **Found while building:** a helper exported from a "use server" file would have become a public endpoint. The device log writer is in its own file (`src/server/auth/device-log.ts`), and a test pins the exported functions of that file.
- **NOT verified here (needs a Supabase project):** the real enroll, verify, unenroll and `admin.mfa.deleteFactor` calls, and what Supabase does to sessions. The rules are proven with fakes (`tests/unit/mfa-devices.test.ts`, `accounts-reset.test.ts`). Please run the manual checks in docs/AUTH_AND_ROLES.md on a TEST project.
- Tests: 745 unit tests pass (new: devices, reset, emails to all owners). Browser tests for the Security page and the reset dialog pass on phone and desktop (local database; the test account has the role **staff**, local only). Lint, type check and build pass.

### Phase 6 report (2026-11-08)
- **New:** `docs/RECOVERY.md` (layer 1 backup device, layer 2 reset by another person, layer 3 last resort in the Supabase dashboard with exact steps, who may do it, how to confirm the person by phone or in person, and recovery for clients).
- **Rewritten:** `docs/AUTH_AND_ROLES.md` (the four roles, the full role-by-action table, where access is checked, the migration steps and how old accounts are mapped, the fresh confirm, 2-step login with two devices, the long manual test list including every check you asked for).
- **Updated:** CLAUDE.md (rule 5, the stack row, the docs list; the git rules were done in phase 0), `docs/DATABASE.md` (one role column, `private.can`, the actor triggers, the removed `admin_profiles` table), `docs/FEATURES.md`, `docs/SECURITY_AND_PRIVACY.md` (T6, T13, new T14), `docs/SECURITY_CHECKLIST.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_HANDOFF.md` (accounts table, Actions menu, role dialog, reset dialog, Security page, two-step setup, not-allowed page, staff menu), `docs/OWNER_GUIDE.md` (roles, lost phone).
- **`.env.example`:** no new variable was needed. `ADMIN_REQUIRE_2FA` stays as it was, and the red banner and the "Before launch" item above stay.
- `docs/PHASES.md` is the old build plan and still names `requireAdmin()` in its history. I left it as it was.

### Phase 7 report (2026-11-08): final checks
- **Unit tests:** 745 pass (48 files). **Lint, type check and production build** pass.
- **Browser tests (local database only, phone and desktop): 155 pass, 1 skipped (a phone-only test on desktop), 0 fail** (rerun 2026-11-08 after the fixes below).
- **The 3 earlier failures, fixed:** the header test now opens the account menu on a wide screen (its items are menu items, not links); the case-study test now expects the page to be hidden. **Developer's decision 2026-11-08:** `/case-study` is hidden from search engines (noindex tag, removed from the sitemap). Before this the page was indexable, even though an older note said "noindex".
- **Browser tests I fixed because the new rule changed them:** the confirm box label is now "Enter the 6-digit code from YOUR authenticator app." (tests matched the old words), and the confirm is now asked even with `ADMIN_REQUIRE_2FA=false` (the old test expected no box). The test "payment methods: a risky change needs a fresh code" now passes with the flag on or off.
- **How I ran them:** `DEV_USER_BYPASS_EMAILS` must be set for the user tests (the first run without it made every "normal user" test run as the owner; I caught it and ran again). Use the command in the README with the local database address.
- **Test data search:** after `pnpm e2e:clean`, a search for `zolb-test` in profiles, requests, email_log, activity_log, services and payment_methods of the local database found **0 rows**. Nothing was written to any real database.
- **Test accounts that were made (local database only, all removed again):** one **owner** (`zolb-test+owner@example.com`, used by the browser tests as before), many **staff** accounts and **one admin** account (`zolb-test+acc-NN@example.com`, `zolb-test+sec-01@example.com`), and test clients. No account with these roles was made on Supabase.

### Deploy runbook (2026-11-08)
- New `docs/DEPLOY_RUNBOOK.md`: (A) a TEST Supabase project with a rehearsal from the old code and a real two-authenticator recovery test, (B) the live migration with backup, the M1 query and how to confirm, (C) how to roll back the Vercel deploy and undo the migration, (D) separate Preview variables for the TEST project, (E) how to check what is on GitHub and which Vercel deploy is production.
- New `docs/rollback/0006_down.sql`: undoes migration 0006. It is in `docs/`, so `pnpm db:migrate` never runs it. It is tested on a local copy (`tests/unit/migration-0006-down.test.ts`): after the undo the database has the same columns, triggers, policies, constraints, types and functions as after migration 0005. What it cannot restore is written at the top of the file.
- Nothing was run on any live database or pushed.

### Live migration done (2026-11-08)
- **Applied to the LIVE Supabase project** (migration 7 in `drizzle.__drizzle_migrations`; 0000 to 0005 were already there). Before that: a full data backup (JSON, outside the repo, in `C:\Users\Derx\rg-backups\`, 15 tables) and a read-only look at the accounts (M1).
- **Result:** the old `admin_profiles` table and the old role types are gone; `account_role` and the `private` schema exist; every policy is for the authenticated role only; counts unchanged (4 profiles, 4 logins, 1 request, 25 activity rows); 2 active owners.
- **Accounts now:** the two Rosemarie Gallego accounts (`rgsbookkeeping73`, `rgservices.ph`) = owner; Derx Ramos = admin (set by hand, as planned); the one other account = user.
- **Not done (cannot be done without a person or a new project):** the TEST Supabase project and the real two-authenticator recovery test (needs two real authenticator apps), and separate Preview variables in Vercel (needs the TEST project). Vercel was not signed in in the browser, so nothing was changed there. `docs/DEPLOY_RUNBOOK.md` parts A and D are still to do.
- **Live site check:** the public site runs the new build (no `/case-study` in the sitemap) and the admin sign in works. A signed-in admin is sent to "Step 2 of 2: a backup device", because migration 0006 marks every staff, admin and owner account as "needs two devices". Each person must add a second device at the next sign in.
- The undo file is `docs/rollback/0006_down.sql` (run only if needed).

### Admin improvements (2026-11-08, branch `feat/admin-improvements`)
- **Admin users:** centered column titles, shorter intro text.
- **Loading screen:** `src/app/admin/(protected)/loading.tsx` shows "Loading..." and page-shaped placeholders at once for every admin menu page.
- **Services:** a table with fixed column widths (6/44/20/12/18 percent, or 50/22/12/16 for staff, who have no checkbox), cards on a phone, 10 per page, an Actions menu, single and bulk delete (admin and owner, fresh confirm; a service that requests used is kept). I chose a table because the alignment is exact and it pages well. The widths differ from the 65/25/10 you asked for because the table also needs a checkbox and an Actions column.
- **Activity:** 20 per page. Automatic clean-up (older than 1 year, daily) already existed. New manual clean-up (90, 180 or 365 days) with the fresh confirm, logged, 30-day minimum in the database.
- **Bug found by a test:** the "requests using this service" count was always 0 (a subquery lost its table name). Fixed before it could let a used service be deleted.
- **Migration `0007_activity_purge_and_service_delete` is APPLIED on the live database** (checked read-only 2026-11-08: migration id 8 recorded, `purge_activity_log_older_than` exists, the 30-day rule and the new permissions are in). The old note below, "not applied", is out of date. (My guide used `to_regproc` with an argument list, which always returns false; use `to_regprocedure`.)
- _Older note:_ migration `0007_activity_purge_and_service_delete` was NOT applied when this section was written. Run `pnpm db:migrate` after the deploy. Until then only the manual clean-up button shows an error. The local dev database gets it by itself (`pnpm dev:db`).
- Tests: 774 unit tests; browser tests (phone and desktop, local database) for the services table, delete, bulk delete, activity paging and the clean-up. Test data (`test-imp-NN` services and `imp.test` activity rows) is removed afterwards.

### CSV copy before the activity clean-up (2026-11-08)
- The "Clean up old entries" dialog now offers "Download these N entries as CSV" for the chosen age. Route `GET /api/admin/activity-export?days=90|180|365` (admin and owner, same permission as the clean-up). Columns: ID, time (UTC), who, action, entity type, entity id, details. Formulas in cells are made safe. Each download is logged (`export.csv`, entity "activity"). No database change.
- Bug fixed: `scripts/dev-db.ts` used `to_regproc` with an argument list (always false), so the local test database tried to re-apply 0007 on every start. It now uses `to_regprocedure`.
- Tests: 777 unit tests and the browser spec (phone and desktop) pass.

### The clean-up now waits for the CSV copy (2026-11-08)
- In the dialog the "Remove ..." button stays off until the CSV copy for the chosen age is downloaded (choose another age and it must be downloaded again). Not needed when there is nothing old to remove.
- The server enforces it too: a clean-up is refused ("Please download the CSV copy of these entries first") unless the same person downloaded the copy for the same age in the last 30 minutes (the download is logged). A copy for another age, by another person, or older than 30 minutes does not count.
- Tests: 779 unit tests and the browser spec (phone and desktop) pass. No database change.

### Loading indicator for all admin clicks (2026-11-08)
- **One indicator for the whole admin area** (`src/components/admin/navigation-progress.tsx`, in the admin shell): a thin bar at the top and a "Loading..." label. It shows at once after a click on any link or card (menu, dashboard cards, settings cards, request rows, pagination, "Next" and "Previous", links inside tables), and after sending a search or filter form (requests, activity, accounts). It goes away when the new address arrives. A safety timeout (20 s for pages, 4 s for downloads and server routes such as the CSV export and Sign out) makes sure it never stays on.
- It shows nothing for the same address, a new tab, another website, or a click with Ctrl or Shift. The rules are in `src/lib/nav-progress.ts` (unit tested).
- Buttons that save or change something already had their own spinner (the form buttons, the row menus), and the menu pages still use `loading.tsx`. Nothing else needed one.
- Tests: 784 unit tests; browser tests on phone and desktop. The two timing tests accept "the page opened at once" for pages the browser fetched in advance.

### How to apply migration 0006 later (you run it, not me)
1. In the admin area open **Export** and download both CSV files.
2. In the Supabase SQL editor run this READ-ONLY query and send me the rows. It changes nothing:
   `select p.email, p.full_name, p.role as account_role, a.role as level, a.is_active from public.profiles p left join public.admin_profiles a on a.id = p.id where p.role = 'admin' or a.id is not null order by p.email;`
3. Expected mapping: Rosemarie Gallego -> owner, Derx Ramos -> owner first, then admin by one hand line (below), staff -> staff, clients -> user. Any other admin-level account: tell me what it should become.
4. On the TEST project first: `pnpm db:migrate` (this also applies 0004 and 0005 if they are still waiting), then `pnpm db:check`.
5. Check: `select role, is_active, count(*) from profiles group by 1,2;` and make sure there is at least one active owner.
6. Make the developer an admin (works only while another active owner exists): `update public.profiles set role = 'admin' where email = '<DERX EMAIL>';`
7. Run the manual checks in docs/AUTH_AND_ROLES.md, then repeat on the live project.

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
17. **Case study:** at `/case-study`, not in the menu. It uses fake data only. **Changed 2026-11-08 (developer's choice): hidden from search engines (noindex, not in the sitemap)** until you decide to publish it.
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


### Accounts and roles session (branch `feat/auth-roles`, 2026-11-07)

Built in phases 0 to 9 (see the list near the top). Every phase was merged into `main` with `--ff-only` after lint, typecheck, unit tests and build passed. Nothing was pushed. Nothing was run on a live database.

**What changed**
- Users can create an account (email + password, email verified), sign in, reset the password, send requests, see "My requests", change their name and phone, download their data and delete their account.
- Admins sign in on the same `/login` page. `requireAdmin` needs `profiles.role = 'admin'` AND an active `admin_profiles` row. An owner can make an existing account an admin and remove the admin role (Settings > Admin users).
- Access is checked in three places: the proxy, every page/action/route, and database Row Level Security (users read only their own rows).
- Header: Sign in / My requests / Admin / Sign out, in the bar and in the phone menu. Sign out is a form POST with a full page redirect.
- `ADMIN_REQUIRE_2FA` stays off for now: only the exact word `false` turns it off. A red banner shows on every admin page and the server logs a warning at start. With it required: forced TOTP setup, a code at each sign in, fresh codes for risky actions. Tested for both values.
- New files: `drizzle/0002_accounts_and_roles.sql`, `drizzle/0003_accounts_security.sql`, `docs/AUTH_AND_ROLES.md`.

**Tests**
- Unit: 486 tests pass (database rules run on the real SQL with a small fake of Supabase: `tests/unit/accounts-rls.test.ts`).
- Browser (local test database only): `accounts.spec.ts` (header states, sign out and Back button, /admin for a user, user A and B, upload with no access, My requests, download, delete) and `admin-2fa.spec.ts` (run once with the flag false and once with true).
- Known failures that are NOT from this work: `smoke.spec.ts` "how it works" expects 5 h2 headings and the page has 6 (content changed in an earlier session), and `admin.spec.ts` "payment methods: a risky change needs a fresh code" only passes with `ADMIN_REQUIRE_2FA=true`.

**Decisions**
| Decision | Why |
|---|---|
| Sign out is `POST /auth/sign-out` (route handler, 303 redirect), not a Server Action | A soft redirect let the Back button show the admin page from the Next.js router cache. A full page load does not. |
| Delete account is `POST /api/account/delete` called with `fetch`, not a Server Action | A Server Action that changes cookies makes Next.js draw the current page again (already signed out). |
| "Signed out" and "account deleted" messages use a 30 second flash cookie, not a `?signed_out=1` address | Changing the address made the header load again and closed the phone menu. |
| The header's sign in part reads the login at request time in its own Suspense, and uses `unstable_rethrow` | Otherwise the signed-out header could be saved in the cached page and shown to everyone. |
| Old guest requests keep `user_id = null`; nobody can claim one by email | Claiming by email alone would be unsafe. Admins and the tracking code still work for them. |
| The old draft-cookie code stays only for old guest drafts | They expire in 7 days. New requests have no draft cookie. |
| In "My requests" users see file names and dates only | Owner choice. No link to open a file. |
| Dev test login (`/api/dev-login`, `DEV_USER_BYPASS_EMAILS`) works only when NODE_ENV is development | Lets pages and browser tests run with no Supabase. Tests prove it is refused elsewhere. |
| `withUserRls` falls back to the normal connection only in development when the local database has no `authenticated` role | The plain local test database has no Supabase roles. Production and tests always use the role. |
| e2e helpers refuse a database that is not on this computer (set `E2E_ALLOW_REMOTE_DB=1` for a Supabase TEST project) | `.env.local` points at the live Supabase project; the tests write and delete data. |
| For the browser tests, blank `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `BREVO_API_KEY`, the Supabase variables | Otherwise the real keys from `.env.local` make the tests wait for the internet. |
| Dev-only HTTP status for a missing `/account/requests/[id]` is 200 with the "not found" page | The page streams. The page is the same in every case. |

**The owner must do by hand** (details in `docs/AUTH_AND_ROLES.md`)
1. On a Supabase TEST project: sign-ups ON, "Confirm email" ON, password length 12, Site URL, email templates, Brevo SMTP (section 2).
2. Back up, then apply the two migrations (section 3).
3. Create the first admin (section 4).
4. Run the manual test list (section 6).
5. Approve the new privacy notice text (version 2.0) and set "Privacy notice version" to `2.0` in Settings > Site content.
6. **Before real clients: set `ADMIN_REQUIRE_2FA=true` on the live site** and test the admin login.

### 2026-11-07 — Hero animation (branch `feat/hero-animation`)
- Added a slow, light CSS animation to the home page hero art (`src/components/public/hero-art.tsx`). It only changes `translate`, `scale` and `rotate`. No JavaScript, no new package, no new file. The component is still a server component and still `aria-hidden`.
- The keyframes and timings are in `src/app/globals.css` (inside `@theme`, the Tailwind 4 way). Each shape has its own time and a negative start delay, so they never move together.
- Phones (under 640 px) use 60% of the distance, through the `--k` variable.
- All classes use the `motion-safe:` prefix. People who ask for less motion get no animation (checked in the built CSS: it sits inside `@media (prefers-reduced-motion: no-preference)`).
- Lint, type check and production build pass.
- Lighthouse (production build, headless, local, mobile): before 100 / LCP 0.9 s / CLS 0 / TBT 40 ms (1 good run). After 100 / LCP 1.0 s / CLS 0 / TBT 90 ms (1 good run). Many runs failed with a Lighthouse error, so only one good run each. The difference is probably noise. Please re-run in Chrome DevTools to confirm.
- Not tested by eye: the page at 390, 768 and 1440 px, and the real reduced-motion setting.

### 2026-11-07 — Hero animation, part 2 (branch `feat/hero-animation-2`)
- The check card now has the word "Verified". The text fades in first, then the check pops in. After a short rest both fade out and the cycle repeats (8 s). The text and the check keep their space, so nothing moves on the page (CLS stays 0).
- The big light orange circle and the small light green circle now follow a path with three stops (about 20 px), so their position clearly changes. Still only `translate` and `scale`.
- Still pure CSS, `motion-safe:` only (reduced motion shows "Verified" and the check fully, with no animation). Lint, type check and build pass.
- Lighthouse (local production build, 1 good run): 100 / LCP 1.0 s / CLS 0 / TBT 40 ms. Same as before part 2.
- Not checked by eye at 390, 768 and 1440 px.

### 2026-11-07 — Hero animation, part 3 (branch `feat/hero-animation-3`)
- The "In progress" badge now follows the same 8 s cycle as "Verified": the text fades in first, then the icon pops in and keeps spinning. Both fade out at the end, then repeat.
- The hero uses its own badge markup (same classes as `StatusBadge`) so the text and the icon can be animated apart. The shared `StatusBadge` is not changed.
- Lint, type check and build pass. Not checked by eye.

### 2026-11-07 — Service fee, payment QR per service, SEO (branch `feat/service-fee-and-qr`)
- **Service fee:** new `services.fee_centavos` (owner sets it in Settings > Services, in pesos). The fee shows on the service card, the service page, the service list in "Start a request", and at the top of the "Pay with a QR code" page together with the service name. An empty fee shows "Fee will be confirmed". The fee is copied to the request when it is made (`requests.service_fee_centavos`), so later price changes do not change old requests. Fee changes are in the activity log.
- **Payment QR per service:** new table `service_payment_methods`. In the service edit page the owner ticks which payment methods (QR codes) the service shows. None ticked = all active methods (same as before). New QR codes are still added in Settings > Payments, so the owner's security check for QR changes stays. The website still takes no money: it only shows the QR.
- **QR size:** 2 x 2 inches (192 px) from 640 px wide. On phones 1.5 inches (144 px).
- **SEO:** metadata in the root layout (keywords, robots/googleBot, Open Graph, Twitter card, theme color, optional Google/Bing verification from environment variables); JSON-LD (WebSite and AccountingService on home; Service with price and BreadcrumbList on service pages); service pages have trimmed descriptions and Open Graph tags; sitemap with priority, change rate and real last-changed dates for services; robots.txt hides all private pages (account, login, register, request, track, admin); web app manifest. Helpers and tests in `src/lib/seo.ts`.
- **Migration `0004_service_fee_and_qr` is NOT applied to Supabase.** Run `pnpm db:migrate` yourself before you deploy this code, or the home and service pages will fail (they read the new column).
- Checks: lint, type check, 494 tests and the production build pass. The build and page checks ran against the local test database (migration 0004 applied there), not Supabase.
- Not checked by eye: the new admin form, the payment page and the QR size on a real phone. The sign-in redirect by role already exists (`afterLoginDestination`: admins go to /admin, users to their account). I did not change it.
- To do for SEO (needs the owner): set `APP_BASE_URL` to the real website address, add the site to Google Search Console and Bing Webmaster Tools, and paste the verification codes into `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION`.

### 2026-11-07 — Google sign in (branch `feat/google-signin`)
- Added "Continue with Google" on the Sign in page and "Sign up with Google" on the Create account page. Routes: `/auth/google` (start) and `/auth/callback` (finish). It uses Supabase Auth with the Google provider and PKCE.
- The button shows only when `GOOGLE_SIGNIN_ENABLED=true`, so nothing is broken before the owner finishes the setup.
- Users only. **Admins cannot sign in with Google** (they are signed out and told to use email, password and the 2-step code), so the admin 2-step login cannot be skipped. The role comes from `profiles`, never from Google.
- Same email as an old account: Supabase joins them, so the client keeps their requests.
- Friendly messages on the Sign in page for cancelled, failed, busy, off and admin cases. Sign in events go to the activity log with `provider: google`.
- Beginner guide for the owner: `docs/GOOGLE_SIGN_IN_SETUP.md` (Google Cloud Console + Supabase + Vercel + tests + fixes).
- Checks: lint, type check and 498 tests pass. The production build could not finish this time because of the known one-connection limit of the local test database (the build before this change passed); I checked the new pages and routes with the dev server instead.
- Needs the owner: do the guide with `rgservices.ph@gmail.com`, then set `GOOGLE_SIGNIN_ENABLED=true`. I could not test the real Google round trip: it needs the Google client and Supabase settings from the guide.
- The Privacy notice may need one line about Google sign in (name, email, picture). Please check it.

### 2026-11-07 — Hero yellow dot (branch `feat/hero-dot-animation`)
- The small yellow dot now glides to the right along the top (about 110 px, 60% on phones) and comes back, 12 s, slow. Before it only bobbed up and down. It moves right and not to the middle, because the first card is in the middle and the orange circle comes in from the right. The path stays in the free space, so it does not cover the card, the circle or the heading.
- Still only `translate` (CSS, `motion-safe:` only). Not checked by eye at 390, 768 and 1440 px.

### 2026-11-07 — Admin accounts page (branch `feat/admin-accounts`)
- **Existing accounts:** Settings > Admin users now lists all accounts (users and admins) with a search box and a **Role** dropdown (User / Admin) with **Save** and **Cancel**. Owner only, fresh 2FA code, logged. User to Admin makes a Staff admin (or gives back the old level). Admin to User removes the admin role. Your own role cannot be changed.
- **New admin account:** full name, email, role (fixed: Admin), level (Staff or Owner) and **temporary password**. It makes a verified Supabase login and the admin records in one go. If saving the admin record fails, the new login is removed again. The password is never saved or logged. I used a fixed **Admin** label (not a checkbox), because this form can only make admins, plus a Level dropdown for Staff or Owner.
- **Safety for temporary passwords:** new column `profiles.must_change_password` (migration `0005_admin_temp_password`, **not applied to Supabase**). After sign in the person goes to the new page `/account/change-password`. The admin area refuses the account until the password is changed (new code `must-change-password` in `checkAdmin`).
- The old "Make an existing account an admin" box was removed from the page, because the Existing accounts list does the same job. The email invitation box stays as "Or invite someone by email".
- Checks: lint, type check and 514 tests pass (new: `tests/unit/admin-accounts.test.ts`).
- **Run `pnpm db:migrate` on Supabase before you deploy** (migrations 0004 and 0005 are both waiting). Making an admin needs `SUPABASE_SECRET_KEY`, like the invitation.
- Not checked by eye: the new page and the change password page in a browser, and a real temporary-password sign in on Supabase.

### 2026-11-07 — Google guide fix (branch `fix/google-guide-authorized-domains`)
- The owner got "Invalid domain: must be a top private domain" when adding `supabase.co` under Authorized domains. The guide was wrong. It now says to leave that box empty (not needed for sign in) and explains the error. Docs only.

### 2026-11-07 — Google guide fix 2 (branch `fix/google-guide-scopes`)
- The Data Access page in Google Cloud starts empty. The guide said the three basic scopes were included by default. It now tells the owner to click "Add or remove scopes" and tick `userinfo.email`, `userinfo.profile` and `openid`. Docs only.

### 2026-11-07 — Google guide fix 3: publishing (branch `fix/google-guide-publish`)
- The owner could not press "Publish app": "To publish your app, you must complete your configuration on the Branding page". The guide wrongly said to leave Authorized domains empty and skip the links. Checked Google's help ("Manage OAuth App Branding", "Manage App Audience") and one user's report. Google says the app home page, privacy policy and terms links are required for external production apps, and the domains of those links must be in Authorized domains. The guide now has the full Branding step, the exact link addresses (`/`, `/privacy`, `/terms`), a domain table, and more rows in "Problems and fixes".
- Not confirmed by any Google page: whether Google accepts a full `*.vercel.app` address as an authorized domain, and the complete list of what the Publish button needs. The guide says so and gives the fallback (own domain). The Privacy notice page may need one sentence about Google sign in.

### 2026-11-07 — Google sign in: show the real error (branch `fix/google-callback-errors`)
- The owner saw "Google sign in was cancelled" after a real try. Cause in our code: `/auth/callback` used the "cancelled" message for **every** return with an `error` (or no code), so the real reason was hidden. Now only `error=access_denied` (a real No on the Google screen) says cancelled. Other errors say "We could not sign you in with Google" and show a safe **Reason code** with a plain hint on the Sign in page. The full error is also written to the server log.
- Likely real cause for the owner: Supabase could not finish with Google (wrong Client ID or Secret in Supabase, or the redirect address in Google not matching). Not confirmed until the owner redeploys and reads the reason code.
- The guide has a new section "How to find the real reason" and a new row in "Problems and fixes". 518 tests pass.

### 2026-11-07 — Google sign in: root cause found (branch `fix/google-signup-disabled`)
- Tested on the live site (rg-app-tau.vercel.app) in the owner's browser with the owner's test Google account. The Google account screen worked and the redirect addresses were right. Supabase then refused with `error_code=signup_disabled`, "Signups not allowed for this instance". Cause: **"Allow new users to sign up" is OFF in the Supabase project** (docs/AUTH_AND_ROLES.md says it must be ON). This blocks Google sign in and also email sign up. Not a code bug.
- Code bug found on the way: Supabase uses `error=access_denied` for this refusal too, so our page still said "cancelled". Now "cancelled" is only when there is no `error_code`. The Sign in page shows the reason code and a hint for `signup_disabled`.
- Guide: new step B1b (turn the switch ON) and a new row in "Problems and fixes". 519 tests pass.
- The sign-in attempt did not create an account (Supabase refused it).

### 2026-11-07 — Day and night mode (branch `feat/dark-mode`)
- New toggle (moon / sun button) in the public header and the admin header. The choice is saved in the browser. First visit follows the device setting. A tiny early script sets the theme before the first paint (no flash). Pure browser side: no cookie, no server work, pages stay static.
- New night palette "Teal Ledger Night" in `src/app/globals.css` (`:root[data-theme="dark"]`): all color roles, all 9 status badges, stronger shadows. Cards now use their own `--card` and `--popover` variables. Documented in `docs/DESIGN_SYSTEM.md` section 2b.
- Home page animations blend in: the orange and teal circles become deep tints, the cards keep a border and a stronger shadow, the yellow dot and orange button keep their colors. QR pictures stay on white.
- Checks: new `tests/unit/dark-palette.test.ts` (WCAG contrast: text 4.5 to 1, borders and focus ring 3 to 1) and `src/lib/theme.test.ts`. Lint, type check and 530 tests pass. Looked at the home page, Sign in and How it works in night mode in Chrome (desktop width): they look right and the choice stays when changing pages.
- Not checked by eye: phone widths, the admin panel and the request/payment pages in night mode. The Cloudflare spam box follows the device setting only (not the toggle).

### 2026-11-07 — Fix hero colors, header and orange buttons (branch `fix/dark-hero-and-header`)
- **Cause of the faded labels in day mode:** my own hero animation. The "In progress" and "Verified" labels were faded to opacity 0 for part of every 8 second cycle (measured: 0.00 to 1.00), so a screenshot at the wrong moment showed almost invisible text. Labels and icons no longer use opacity: the label slides 4 px into place, the icon pops with scale. A test checks that these keyframes have no opacity. Measured over 11 seconds: lowest opacity of labels and cards is 1.
- **Hero colors:** new `--hero-*` tokens for day and night (values in `docs/DESIGN_HANDOFF.md`). Night cards #243B37 with a light border, visible placeholder lines, badge and Verified colors as asked. The night peach circle needed 3 rounds: the first value (alpha .42) looked brown. The final coral gradient is rgba(255,170,142,.78) to rgba(255,124,102,.56). Tests check contrast and that it is coral, not brown.
- **Header:** signed in people get ONE account menu (initial circle, first name or "Account", long names cut with "..."). Menu: My requests (Admin for admins) and Sign out (form POST). Keyboard, Escape and click outside work. No text wraps. Buttons 40 px (44 px on phones). Full header from 1280 px, phone menu below. Under 400 px the theme toggle is in the phone menu. Under 350 px the logo subtitle is hidden. Tested 80 cases (10 widths x 4 states x 2 modes) plus 14 more widths: no overlap, no wrapped text, at least 16 px free.
- **Orange button:** token `cta` is now #C2410C, white text (5.2 to 1), hover #9A3412 (7.3 to 1), same in day and night. There is only ONE orange button style (the `accent` variant). The only other #FF7B47 left is the logo mark and the share picture (not buttons).
- **Lighthouse (production build, home page, headless):** before 100 / LCP 0.9 s / CLS 0 / TBT 30-40 ms. After 100 / LCP 0.9 s / CLS 0 / TBT 40-50 ms. TBT differs by about 10 ms, which is test noise on this computer (runs vary by that much).
- Hero animation checked in a browser: all five shapes, the spinner and the check move; with reduced motion nothing moves.
- Test accounts: three local test accounts (zolb-test+hdr-user, zolb-test+hdr-admin, zolb-test+hdr-long @example.com) were made in the LOCAL throwaway database only. **One has the role admin** (needed to see the admin header state). All three were deleted afterwards and a search found 0 left in profiles, admin_profiles, requests, email_log and activity_log.
- Not checked: the real Supabase sign in with the new header (the local test login was used).

### 2026-11-07 — Footer cleanup (branch `fix/footer-cleanup`)
- Removed "You pay in your own GCash, Maya or bank app. You never pay on this website." from the footer. It stays in the Terms of service and on the How it works page (not changed).
- The footer already used the same container as the header (max 1200 px, same side padding). From 1280 px the page links are one row with equal 24 px gaps, pushed to the right, so "Track my request" ends at the same right edge as "Terms of service" (measured at 1280 and 1440: the same pixel). The "Pages" heading now sits above the first link.
- Phones (390 px) and tablets are unchanged: one link per line, and 2 by 2 on tablets.
- Checked the footer at 390, 768, 1280 and 1440 px in day and night mode. Lint, type check and build pass.

### 2026-11-07 — Dark hero colors, round 2 (branch `fix/dark-hero-a2`)
- Night mode only (tokens `--hero-*` in `:root[data-theme="dark"]`): big circle flat #1E6B60, small circle flat #2A8F82, yellow dot unchanged. Both cards are glass: fill rgba(20,45,45,.70), side border rgba(255,255,255,.14), brighter top border rgba(255,255,255,.28) (new token `--hero-card-border-top`). Placeholder lines rgba(255,255,255,.16). "In progress": amber badge rgba(251,191,36,.16) with text and spinner #FCD34D. "Verified": check circle rgba(52,211,153,.18), check #6EE7B7, label #A7F3D0.
- No backdrop-filter, blur, filter, glow or gradient (a test checks the tokens and the component). Animation not changed. Light mode not changed (a test pins the day colors; "In progress" #0B5C52 on #DAF1EE and "Verified" #14532D were already right).
- One side effect fixed: the card is see-through, so the small orange bar behind the Verified card showed as a muddy stripe. New token `--hero-bar`: same orange in day mode (the solid card hides it, so nothing changes) and transparent at night.
- Checked in a browser at 390 and 1440 px, day and night. The tests check text at least 4.5 to 1 (labels), icons at least 3 to 1, circles and card edges at least 1.5 to 1 against the page. The animation moves in both modes and stops with reduced motion. Lint, type check, 544 tests and build pass.

### 2026-11-07 — Fewer section lines (branch `fix/remove-section-lines`)
- Removed three full-width lines: below the "How it works" section (home page), above the footer, and inside the footer above the copyright row. Kept: the line under the header, the line above "How it works", the line under each page heading (Services, How it works, Contact; same job as the header line), the line under the hero, and every card border.
- Sections now separate by a soft background change and spacing: the "How it works" section keeps its background; "Questions?" and the footer each differ from the section above. Day mode already alternated white and #F6F7F5. Night mode now alternates exactly #0B1413 and #0F1A18 (the night `--surface` token changed from #0F1A19 to #0F1A18; the phone browser-bar color too). Text contrast tests still pass.
- Other public pages (Services, How it works, Contact) had no other line below their content, and the footer is shared, so they are consistent (measured in a browser, day and night).
- Looked at the home page at 390 and 1440 px, day and night. Lint, type check, 544 tests and build pass.

### 2026-11-08 — Simpler footer (branch `fix/footer-simplify`)
- Removed the "Pages" column and the all-caps line under the logo. The header was not changed. The unused `FOOTER_NAV` list was removed from `site-nav.ts`.
- New footer, same container as the header: row 1 has the logo on the left and "Privacy notice" and "Terms of service" on the right (24 px apart, same size and color, centered with the logo). Row 2 is the copyright text (smaller, muted, text unchanged), starting exactly under the logo. Under 640 px it is one left aligned column: logo, the two links in one row (they wrap if needed, 44 px tall), copyright. The background is unchanged.
- Measured at 390, 639, 640, 768 and 1440 px in day and night mode: the copyright's left edge equals the logo's left edge; at 1440 px the last link ends at 1288 px, the same as the cards and the header's "Start a request" button; the link gap is 24 px; no horizontal overflow. Text contrast stays above 4.5 to 1 (day links 16:1, copyright 6.9:1; night links 14:1, copyright 8:1 on the footer color).
- Lint, type check, 544 tests and build pass.

### 2026-11-08 — Go back in the request steps, optional documents, and offline payments (branch `feat/flow-back-and-offline-pay`)
- **Client steps:** the step bar now links the steps already passed (Your details, Documents, Payment, Receipt). On phones there is a "Go back to ..." link. New page `/request/[id]/details` lets the client change name, mobile number, business and message while the request is a draft (service and email stay). Back buttons were added on Documents, Payment and Review.
- **Documents are optional:** new heading and text ("bring your documents to our office"); the Review page says "None uploaded" and "You can pay later ... or at our office". The admin file box says the client may bring the documents.
- **Offline payments:** staff, admin and owner can "Record a payment (cash or other)" on the admin request page (cash, bank transfer, other; amount, date, receipt number or note). The request moves to Payment verified, the client gets the payment email, and when STAFF record it every owner gets an email. Admin and owner can void it. New permission actions `payments.record_offline` (staff and up) and `payments.void` (admin and owner), logged as `payment.recorded_offline` and `payment.voided`. Staff still cannot verify or reject online QR payments.
- A receipt number is saved as letters and digits only (an existing database rule); if empty, a short `OFF...` code is made.
- **Migration `0008_offline_payments.sql` (hand-written) is NOT applied to the live database.** After you deploy, run `pnpm db:migrate` (see docs/DEPLOY_RUNBOOK.md). Until then the "Record a payment" form shows an error; everything else works. The local test database got it through `pnpm dev:db`.
- Tests: 11 new unit tests (`tests/unit/offline-payments.test.ts`), the permission table tests, and 2 new browser tests (go back and edit details; record and void a cash payment).
- Test accounts: only the local test owner `zolb-test+owner@example.com` (role **owner**, local database only, removed by the tests) and `zolb-test+usera@example.com`; a search of the local database found none left.

### 2026-11-08 — Sign out loading screen and a colored "My Requests" link (branch `feat/signout-loading-my-requests`)
- Sign out (clients, staff, admin, owner; wide menu, phone menu and admin header) now shows a full screen "Signing out..." message the moment the button is tapped, and blocks a second tap. The message is added straight to the page, because the menu can close while the server works. The sign out is still a plain form POST.
- The account menu link is now "My Requests" (capital R, also the page title, heading and back link) and is colored (soft green fill, green border, bold dark green text; solid green with white text on hover), also in the phone menu. Staff, admin and owner get the same style on their "Admin" link.
- Tests: new browser test for the message; unit test for the sign out form updated. No database change. Test accounts: only local test users, none left (searched).

### 2026-11-08 — Sign in no longer disappears while the page loads (branch `fix/header-signin-flash`)
- Cause: while the header reads the login (a refresh or slow connection) its placeholder was an empty box, so "Sign in" vanished for a moment.
- Fix: the placeholder is now a working "Sign in" link of the same size. A browser that was signed in last time (a small `rg_hint` cookie, no private data, never used for access) gets a neutral pulsing box instead, so a signed in person never sees a wrong "Sign in". A tiny script in the root layout sets the mark on `<html>` before the first paint; the real header (`AuthHint`) keeps the cookie correct.
- Tests: unit test for the placeholder and the hint script. No database change.

### 2026-11-08 — Live data clean-up before hand-over (branch `chore/clean-live-data-run`)
- Run on the live database at the owner's request (all data was test data, so no backup). Kept only `rgservices.ph@gmail.com` and `rgsbookkeeping73@gmail.com` (both role owner). Removed: the developer admin account, one client account, 1 request, 4 email log rows and the rate-limit rows. Kept: 6 services, 3 payment methods, settings, checklists. Storage had no files. Migrations 0000 to 0008 were already applied.
- Result check: 2 profiles, 2 sign-in accounts, 0 requests, payments, files, notes, emails. The activity log keeps its old rows plus one line `system.cleaned_before_handover`.
- Note: there is now no `admin` role account, only two owners. An owner can invite a new admin from Settings > Admin users when needed.
- `scripts/cleanup-before-handover.sql` now accepts any two active owner or admin accounts.

### 2026-11-08 — Admin account set up on the live database (branch `chore/set-admin-account`)
- On the owner's request: `rgservices.ph@gmail.com` is now role **admin** with the name "System Admin" (it was an owner with no name). `rgsbookkeeping73@gmail.com` (Rosemarie Gallego) stays the only **owner**. Done with one SQL update (no migration, no code change) and logged in the activity log as `account.role_changed`.
- The admin can do everything except change an owner account. The owner can invite more staff or admins from Settings > Admin users.
