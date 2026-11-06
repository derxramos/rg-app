# RG's Bookkeeping App

A website and request system for **RG'S BOOKKEEPING AND ACCOUNTING SERVICES** (Philippines).
Clients pick a service, send their details and documents, pay by QR code in their own app, and track
their request with a code. The owner and staff manage requests in an admin area.

Read `CLAUDE.md` first (rules and stack), then `PROGRESS.md` (what is done and what is next).
All planning docs are in `docs/`.

## Run it on your computer

You need Node.js 22 or newer and [pnpm](https://pnpm.io).

```bash
cp .env.example .env.local     # then fill in the values (see the comments in the file)
pnpm install
pnpm db:migrate                # apply the database migrations to your Supabase project
pnpm storage:setup             # create the two storage buckets
pnpm db:seed                   # default settings and the first owner account
pnpm dev                       # open http://localhost:3000
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test                      # unit tests (they need no Supabase account)
pnpm test:integration          # proves the public Supabase key cannot read any table (needs .env.local)
pnpm test:e2e                  # Playwright (first run: pnpm exec playwright install chromium)
```

## Design check page

While developing, open `http://localhost:3000/dev/ui` to see every shared UI part next to the design
rules in `docs/DESIGN_SYSTEM.md`. This page is blocked in production.
