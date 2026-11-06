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
| Admin login | Supabase Auth (email + password + required TOTP 2FA) |
| Files | Private Supabase Storage bucket, signed links for admin |
| OCR | Tesseract.js 7 in the browser only |
| Email | Brevo transactional REST API |
| Spam protection | Cloudflare Turnstile + rate limiting in Postgres |
| Hosting | Netlify free plan (code must stay host-independent) |
| Scheduled jobs | GitHub Actions (keep-alive, file cleanup) |
| Tests | Vitest (unit), Playwright (a few end-to-end checks) |

Exact versions and the date we checked them are in `docs/ARCHITECTURE.md` → "Versions".

## Hard rules

1. **Work on one phase at a time.** Stop at the end of each phase and wait for approval. Phases are in `docs/PHASES.md`.
2. **Update `PROGRESS.md`** at the end of every work session.
3. **Never put secrets in code.** Every environment variable is listed in `.env.example` with a short comment.
4. **Server checks everything.** Never trust values from the browser, including OCR values. Validate with Zod on the server.
5. **Every server action and route checks access first.** Use `requireAdmin()` or `requireRequestAccess()` before any read or write.
6. **No host-only features.** Do not use Netlify Forms, Netlify Blobs, Netlify scheduled functions, or Vercel-only APIs. Use plain Node.js and Web APIs.
7. **Do not invent government requirements or fees.** Service checklists start empty. The owner fills them in.
8. **Do not use government agency logos.** Text names only (SSS, Pag-IBIG, PhilHealth, BIR, etc.).
9. **Client documents never appear on the tracking page.** Only status, timeline, and the admin's message.
10. **The receipt image is never uploaded or stored.** Only the four text fields are saved.
11. **Log sensitive admin changes** in `activity_log` (payment methods, status changes, settings, file opens, exports).
12. **Keep functions small.** One job per function. Comments explain *why*, in plain English.
13. **Write tests** for OCR parsers, Zod validation, status changes, and permission checks.
14. **Watch the free limits.** Netlify free plan has a hard credit limit. Do not deploy to production for every small change. Use deploy previews.

## Code conventions

- Folder layout: see `docs/ARCHITECTURE.md` → "Folders".
- File names: `kebab-case.ts`. React components: `PascalCase` export names.
- Database: `snake_case` table and column names. TypeScript: `camelCase`.
- Money is stored as **integer centavos** (₱150.50 → `15050`). Never use floats for money.
- Times are stored in UTC (`timestamptz`). Show them in Asia/Manila time.
- Phone numbers are stored in `+63XXXXXXXXXX` format.
- Server-only code lives in `src/server/` and starts with `import "server-only"`.
- Shared Zod schemas live in `src/lib/validation/`.

## How to run (after Phase 1 exists)

```bash
cp .env.example .env.local     # then fill in the values
npm install
npm run db:migrate             # apply Drizzle migrations
npm run db:seed                # add sample services and settings
npm run dev                    # open http://localhost:3000
npm test                       # unit tests (Vitest)
npm run test:e2e               # end-to-end tests (Playwright)
npm run lint && npm run typecheck
```

## Docs

- `PROGRESS.md` — what is done, what is next, decisions, open questions
- `docs/ARCHITECTURE.md` — folders, data flow, auth, uploads, OCR, email, jobs, hosting, versions
- `docs/DATABASE.md` — tables, fields, indexes, access rules
- `docs/FEATURES.md` — user stories with acceptance checks
- `docs/SECURITY_AND_PRIVACY.md` — threats and fixes, Data Privacy Act basics
- `docs/OCR_PAYMENTS.md` — receipt OCR and parser design, tests, edge cases
- `docs/PHASES.md` — build order and "done when" checks
- `docs/DESIGN_HANDOFF.md` — screens, components, states, design tokens
