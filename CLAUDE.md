# CLAUDE.md — RG's Bookkeeping App

Short rules for anyone (human or AI) who works on this code. Read this first.

## What this app is

A real website and request system for **RG'S BOOKKEEPING AND ACCOUNTING SERVICES** (Philippines).
Clients pick a service, send their details and documents, pay by QR code outside the app,
and track their request with a code. The owner and 1–2 staff manage requests in an admin area.
It is also a portfolio case study, so code quality and docs matter.

Target cost: **$0 per month.**

## Language rule

- Use simple, plain English in code comments, docs, commit messages, and replies.
- Avoid idioms. If you use a technical word, explain it in one short sentence.

## Stack (decided — ask before changing)

| Part | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript (strict mode) |
| UI | Tailwind CSS, shadcn/ui |
| Validation | Zod (same schemas on client and server) |
| Database | PostgreSQL on Supabase (free plan), pooled connection |
| ORM | Drizzle ORM with the `postgres` driver (`prepare: false`) |
| Login | Supabase Auth: email + password, verified email. Optional Google sign in for clients only. One role column in the `profiles` table: `user` (client), `staff`, `admin` (the developer), `owner`. Staff, admin and owner use TOTP 2FA with two devices, behind the server-only variable `ADMIN_REQUIRE_2FA` (only the word `false` turns it off) |
| Files | Private Supabase Storage bucket, signed links for admin |
| OCR | Tesseract.js 7 in the browser only |
| Email | Brevo transactional REST API |
| Spam protection | Cloudflare Turnstile + rate limiting in Postgres |
| Package manager | pnpm (Next.js docs list it as a supported package manager) |
| Hosting | Vercel (free subdomain for now; code must stay host-independent) |
| Scheduled jobs | GitHub Actions (keep-alive, file cleanup) |
| Tests | Vitest (unit), Playwright (a few end-to-end checks) |

Exact versions and the date we checked them are in `docs/ARCHITECTURE.md` → "Versions".

## Hard rules

1. **Work on one phase at a time.** Stop at the end of each phase and wait for approval. Phases are in `docs/PHASES.md`.
2. **Update `PROGRESS.md`** at the end of every work session.
3. **Never put secrets in code.** Every environment variable is listed in `.env.example` with a short comment.
4. **Server checks everything.** Never trust values from the browser, including OCR values. Validate with Zod on the server.
5. **Every server action and route checks access first.** Use `requirePanel(action)` / `guardPanelPage(action)` / `withPanel({ action })` (admin area), `requireUser()` / `requireVerifiedUser()` or `requireRequestAccess()` before any read or write. The action name comes from the one role table in `src/lib/permissions.ts` (`can(role, action)`). Service functions check it again (`assertCan`), and the database has triggers and Row Level Security as a second layer. A page check does not protect a Server Action. The role always comes from the `profiles` table, never from the browser. `ADMIN_REQUIRE_2FA=false` skips only the 2FA code step, never a role check. Details: `docs/AUTH_AND_ROLES.md`.
6. **No host-only features.** Do not use Vercel-only or Netlify-only features (forms, blobs, KV, cron, edge config). Reading Vercel's built-in environment variables for the site address is the one allowed exception. Use plain Node.js and Web APIs.
7. **Do not invent government requirements or fees.** Service checklists start empty. The owner fills them in.
8. **Do not use government agency logos.** Text names only (SSS, Pag-IBIG, PhilHealth, BIR, etc.).
9. **Client documents never appear on the tracking page.** Only status, timeline, and the admin's message. In "My requests" a signed-in user sees file **names and dates** only, never a link to open a file.
10. **The receipt image is never uploaded or stored.** Only the four text fields are saved.
11. **Log sensitive admin changes** in `activity_log` (payment methods, status changes, settings, file opens, exports).
12. **Keep functions small.** One job per function. Comments explain *why*, in plain English.
13. **Write tests** for OCR parsers, Zod validation, status changes, and permission checks.
14. **Watch the free limits.** The Vercel free (Hobby) plan has usage limits, and it is meant for non-commercial use. Check Vercel's current terms before real clients use the site. Do not deploy to production for every small change. Use preview deployments.

## Git rules (every session)

- Work on the branch `feat/roles-accounts-recovery` (made from `main`) for the roles, accounts table and 2-step login recovery work.
- After EVERY finished step: run `git status` (never stage `.env` files or secrets), then `git add` the files and `git commit` with a clear message.
- After each phase passes lint, tests and build: switch to `main` and run `git merge --ff-only feat/roles-accounts-recovery`. If a fast-forward is not possible, rebase the feature branch on `main` first, fix conflicts, and run the checks again. Then switch back to the feature branch for the next phase. After the LAST phase, stay on `main`. Keep the feature branch.
- NEVER run `git push`. Never force anything. Never run `git reset --hard`. Never change remotes or git config. (`.claude/settings.json` blocks these.)
- At the end, show `git status -sb` and `git log --oneline -15`, and tell the owner: "Ready for you to run git push from rg-app."

## Code conventions

- Folder layout: see `docs/ARCHITECTURE.md` → "Folders".
- File names: `kebab-case.ts`. React components: `PascalCase` export names.
- Database: `snake_case` table and column names. TypeScript: `camelCase`.
- Money is stored as **integer centavos** (₱150.50 → `15050`). Never use floats for money.
- Times are stored in UTC (`timestamptz`). Show them in Asia/Manila time.
- Phone numbers are stored in `+63XXXXXXXXXX` format.
- Server-only code lives in `src/server/` and starts with `import "server-only"`.
- Shared Zod schemas live in `src/lib/validation/`.

## How to run

```bash
cp .env.example .env.local     # then fill in the values
pnpm install
pnpm db:migrate                # apply Drizzle migrations
pnpm db:seed                   # add sample services and settings
pnpm dev                       # open http://localhost:3000
pnpm test                      # unit tests (Vitest)
pnpm test:e2e                  # end-to-end tests (Playwright)
pnpm lint && pnpm typecheck
```

## Docs

- `docs/SETUP_GUIDE.md` — beginner step-by-step guide to go live (accounts, keys, Vercel)
- `docs/OWNER_GUIDE.md` — daily use for the owner
- `PROGRESS.md` — what is done, what is next, decisions, open questions
- `docs/ARCHITECTURE.md` — folders, data flow, auth, uploads, OCR, email, jobs, hosting, versions
- `docs/DATABASE.md` — tables, fields, indexes, access rules
- `docs/FEATURES.md` — user stories with acceptance checks
- `docs/SECURITY_AND_PRIVACY.md` — threats and fixes, Data Privacy Act basics
- `docs/AUTH_AND_ROLES.md` — accounts, roles and the role-by-action table, guards, Supabase sign-in setup, migrations, 2-step login, manual test list
- `docs/DEPLOY_RUNBOOK.md` — exact steps: test Supabase project and recovery test, live migration, rollback, separate Preview variables
- `docs/RECOVERY.md` — a lost authenticator: backup device, reset by another person, last resort in Supabase; recovery for clients
- `docs/GOOGLE_SIGN_IN_SETUP.md` — beginner guide: turn on "Continue with Google" (Google Cloud + Supabase)
- `docs/OCR_PAYMENTS.md` — receipt OCR and parser design, tests, edge cases
- `docs/PHASES.md` — build order and "done when" checks
- `docs/DESIGN_HANDOFF.md` — screens, components, states, design tokens
- `docs/DESIGN_SYSTEM.md` — design rules: tokens, fonts, component map, status badges, screen map (single source of truth for how the app looks)
