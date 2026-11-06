// Content for the portfolio case study page (/case-study). Plain words. Numbers come from this project's own
// tests and runs and are dated. Nothing here is a made-up result: things that were NOT measured say so.
//
// Update METRICS when the numbers change. The page shows "as of" next to them.

export const METRICS_AS_OF = "2026-11-06";

export const METRICS = {
  unitTests: 321,
  browserTests: 68,
  // Lighthouse on the public pages, mobile settings, production build, local test database (Phase 2).
  lighthouse: { performance: "95 to 100", accessibility: "100", seo: "100" },
  // The receipt reader, measured in Chrome on the developer's computer with a SYNTHETIC receipt (Phase 4).
  ocr: { downloadMb: 4.2, seconds: "2 to 3" },
  fonts: "2 files, about 28 KB",
  phases: 8,
  monthlyCost: "$0",
} as const;

export const DECISIONS: { decision: string; why: string; tradeOff: string }[] = [
  {
    decision:
      "Only the server talks to the database. Row Level Security is ON for every table with no policies.",
    why: "Clients have no login, so per-user rules do not fit. One place for all checks is easier to read, test and explain. If a public key ever leaks, it can read nothing.",
    tradeOff:
      "The server connects with a strong role, so every function must check access first. A source test fails if an admin action forgets to.",
  },
  {
    decision: "Drizzle ORM with plain SQL migrations (not Prisma).",
    why: "Small, no extra engine, works with the Supabase pooler, and the SQL is visible. Triggers and checks live in the same migration files.",
    tradeOff: "A few things (triggers, the auth link) are hand-written SQL, not generated.",
  },
  {
    decision:
      "Clients get access to ONE request with a random cookie token. Only a hash of it is stored.",
    why: "No accounts to forget passwords for. A stolen database cannot open drafts.",
    tradeOff:
      "Another phone or browser cannot continue a draft. The tracking page covers that after the request is sent.",
  },
  {
    decision: "Files go through our server, not straight to storage.",
    why: "The server can read the first bytes and refuse a program renamed to .jpg before anything is saved.",
    tradeOff: "Uploads use server time. Files are small (3 MB), so this fits the free host limits.",
  },
  {
    decision: "Public pages are static and refreshed from the database with tagged caching.",
    why: "Fast on slow data and cheap on the free hosting credits. An admin change clears the cache at once.",
    tradeOff:
      "The build needs a database. Cached content can be up to 5 minutes old if a tag is missed.",
  },
  {
    decision: "Receipt reading runs in the browser only (Tesseract.js).",
    why: "The receipt picture never leaves the phone, so we cannot store or leak it.",
    tradeOff:
      "A 4 MB download the first time, and slower on old phones. Typing the values always works.",
  },
  {
    decision:
      "The tracking lock is counted per code in a log of wrong tries, not on the request row.",
    why: "A code that does not exist behaves exactly like one that does, so nobody can learn which codes exist.",
    tradeOff: "A few more small rows, cleaned up every day.",
  },
  {
    decision: "A development-only admin bypass, refused by a test in production.",
    why: "The whole admin area could be built and tested with no Supabase account.",
    tradeOff:
      "It is a risky switch by nature. It works only when NODE_ENV is development, and a test checks which files may read it.",
  },
];

export const LESSONS: string[] = [
  "Test the real thing in a real browser. Reading the Content-Security-Policy in a test file said it was fine. Running the receipt reader under it found nothing wrong, but running the whole flow in a production build found a form that wasted a single-use spam token on a typo.",
  "Slow phones change the code. A client can pick a picture before the page is ready. The form now picks up a file that is already chosen.",
  "Write the permission check where the data is, not where the page is. Every admin function takes the acting admin and checks the role, so a new page cannot forget it.",
  "Say what you did not verify. Real Supabase login, real emails and real receipts were out of reach during the build. The security checklist marks each of those instead of ticking it.",
];

export const NEXT_STEPS: string[] = [
  "Collect 3 to 5 real receipts per app (with permission, names blurred) and measure the OCR accuracy. The parsers use placeholder patterns until then.",
  "Run the whole live checklist once with real accounts: login and 2FA, real emails landing in the inbox, the private bucket, and the scheduled jobs.",
  "Replace the draft privacy notice with the owner-approved text, and add Filipino next to English.",
  "Tighten the Content-Security-Policy with per-request nonces if the free hosting credits allow dynamic pages.",
  "Add a second admin screen for staff on phones: a short list of what needs action today.",
];
