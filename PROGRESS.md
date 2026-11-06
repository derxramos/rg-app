# PROGRESS.md

Update this file at the end of every work session.

**Current status:** Planning. Docs written, waiting for owner approval. No app code yet.
**Last updated:** 2026-11-06

**Next step:** Owner reviews all planning docs and answers the open questions. After approval, start Phase 1 (Foundation and database).

---

## Phase checklist

Details for each phase are in `docs/PHASES.md`.

- [x] Phase 0 — Planning docs
- [ ] Phase 1 — Foundation and database
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

---

## Open questions

1. Does the business have its own domain name (for example `rgbookkeeping.ph`)? This decides the email sender address and the website address.
2. Should staff accounts be able to verify payments, or only the owner?
3. Public site language: English only, or English + Filipino?
4. Starting values: how many days to keep files after Completed/Cancelled (proposal: 30), and max files per request (proposal: 15)?
5. Will the GitHub repository be public (for the portfolio) or private?

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
