# DESIGN_HANDOFF.md

What the designer needs to make. Mobile first (360 px wide), then tablet (768 px) and desktop (1280 px).

Design for **slow data and small screens**: few images, no heavy fonts (max 2 font files), big tap targets (at least 44 × 44 px), high contrast.

No government agency logos. Text names only.

---

## 1. Design tokens we expect

Please give values as a table (we will put them into Tailwind CSS variables).

| Group | Tokens |
|---|---|
| Colors | `primary`, `primary-foreground`, `secondary`, `accent`, `background`, `foreground`, `muted`, `muted-foreground`, `border`, `input`, `ring`, `card` |
| Status colors | `success`, `warning`, `danger`, `info` (each with a text-on-color pair) |
| Request status colors | one color per status (9), must also have an icon or text, not color only |
| Typography | font family (1 for text, optional 1 for headings), sizes `xs, sm, base, lg, xl, 2xl, 3xl`, line heights, weights (max 3) |
| Spacing | 4 px scale: `1=4, 2=8, 3=12, 4=16, 6=24, 8=32, 12=48, 16=64` (or your own) |
| Radius | `sm`, `md`, `lg`, `full` |
| Shadows | `sm`, `md` (keep it light) |
| Breakpoints | `sm 640`, `md 768`, `lg 1024`, `xl 1280` (or your own) |
| Dark mode | Not needed for v1 |

Contrast: text must pass WCAG AA (4.5:1 normal text, 3:1 large text).

---

## 2. Public screens

For each screen: **default**, **loading**, **error**, and **empty** state where it applies.

| # | Screen | Route | States / notes |
|---|---|---|---|
| S1 | Home | `/` | default; services section empty state |
| S2 | Services list | `/services` | default, empty ("No services listed yet"), loading skeleton |
| S3 | Service detail | `/services/[slug]` | with checklist; **empty checklist** ("Please contact us for the list"); not found |
| S4 | How it works | `/how-it-works` | default (step diagram) |
| S5 | Contact | `/contact` | form default, field errors, sending, success, send failed (with Messenger/Viber) |
| S6 | Privacy notice | `/privacy` | long text page with version and date |
| S7 | Request step 1 — service + details | `/request` | default, field errors, consent not ticked, Turnstile check, submitting, server error, rate-limited |
| S8 | Tracking code shown | `/request/[id]/code` | big code, copy button, "copied" state, "Save this code" advice |
| S9 | Request step 2 — upload | `/request/[id]/documents` | empty checklist items, file uploading (progress), uploaded, upload failed (retry), wrong type, too big, max files reached, storage full |
| S10 | Request step 3 — payment QR | `/request/[id]/payment` | list of methods, one method, **no active methods** ("Please contact us to pay"), save/copy states |
| S11 | Request step 4 — receipt | `/request/[id]/receipt` | no image yet, image chosen, OCR loading (download size note), OCR reading (progress), OCR done (fields marked "please check"), low confidence fields, wrong-app warning, OCR failed → manual, duplicate reference error, submitting |
| S12 | Review and submit | `/request/[id]/review` | with payment, without payment ("Not paid yet") |
| S13 | Request submitted | `/request/[id]/done` | code again, what happens next |
| S14 | Track — form | `/track` | default, errors, locked ("Too many tries, wait 15 minutes"), rate-limited |
| S15 | Track — result | `/track/result` | each status, with/without admin message, "Pay now" button, "Upload more" button (Waiting for client only), timeline |
| S16 | Draft expired / no access | `/request/expired` | explains and links to Track or Start again |
| S17 | 404 and error pages | — | with Messenger/Viber backup block |

---

## 2b. Account screens (new: sign in, accounts, My requests)

Clients now have accounts. Reuse the existing components and tokens (page heading, form fields, warning box, status badge, timeline, empty state, Turnstile area). Each screen needs: **default, field errors, submitting, server error, rate-limited** where it has a form. Forms keep what the person typed after an error. Errors use an icon and words, never color alone. All touch targets at least 44 px.

| # | Screen | Route | States / notes |
|---|---|---|---|
| U1 | Sign in | `/login` | default; field errors; wrong email or password (one message for both); "Please verify your email first" with a link to send it again; too many tries; "Your session ended. Please sign in again." (comes with a return path); already signed in (redirects). Links: Forgot your password, Create an account, Track my request (code only) |
| U2 | Create an account | `/register` | full name, email, password (with the rule: at least 12 characters), confirm password, consent checkbox (Privacy notice + Terms links), Turnstile; field errors; weak password; too many tries |
| U3 | Check your email | `/register/check-email` | what to do next, "Send the link again" form (email + Turnstile), the same answer whether or not the email exists |
| U4 | Forgot password | `/forgot-password` | email + Turnstile; success message is always the same ("If an account exists..."); too many tries |
| U5 | Choose a new password | `/reset-password` | new password + confirm; link ended (old or used) with a link to ask again; same-as-old and weak password errors |
| U6 | Link did not work | `/auth/error` | old or used email link; buttons to ask for a new link |
| U7 | My requests (account) | `/account` | list of the person's requests (card on phone, table on desktop) with status badge; empty state ("You have no requests yet" + Start a request); profile block (name, phone, email); Download my data; Delete my account (type DELETE + password, blocked while a request is open). Built in Phase 7 |
| U8 | Request detail (account) | `/account/requests/[id]` | status badge, timeline, the latest message from us, payment state, **file names and dates only** (no open or download link), Pay now / Upload more buttons only when the status allows, refreshes by itself every 60 seconds; "not found" looks the same for a request that is not yours. Built in Phase 7 |
| U9 | Not allowed | `/admin/not-allowed` | a signed-in person who is not an admin opened /admin: short text and buttons to My requests and Home |

### Header states (public pages, `SiteHeader`)

Orange stays **only** for "Start a request" (one shared button style, token `cta`: white on #C2410C, hover #9A3412, teal focus ring). The header is 64 px tall. No header text ever wraps (`whitespace-nowrap`); the logo and buttons do not shrink. Header buttons are **40 px** tall (44 px on phones). Gaps between buttons are 8 px; at least 16 px is free between the logo, the links and the buttons.

**Breakpoints (found by testing 80 cases: 10 widths x 4 states x 2 modes, no overlap, no wrap):**
- **From 1280 px:** the full bar. Worst case (a very long name) still keeps 16 px free.
- **Below 1280 px:** logo, Start a request (from 640 px), theme toggle, Menu button.
- **Below 400 px:** the theme toggle moves into the phone menu (the logo and two buttons do not fit).
- **Below 350 px:** the logo subtitle "BOOKKEEPING & ACCOUNTING" is hidden. The tile and "RG'S" stay.

| State | Desktop bar (from 1280 px) | Phone menu |
|---|---|---|
| Visitor (not signed in) | Home, Services, How it works, Contact, Track my request · theme toggle · **Sign in** (outline) · **Start a request** (orange) | menu links, Start a request (orange), then a divider, Day/Night mode (under 400 px only) and **Sign in** (outline, full width) |
| User | same links · theme toggle · **ONE account menu button** (initial circle + first name, or "Account") · Start a request. Menu items: **My requests** (/account), **Sign out** | menu links, Start a request, divider, Day/Night mode (under 400 px only), **My requests** and **Sign out** as normal list items (44 px) |
| Admin | same, but the first menu item is **Admin** (/admin) | same, with **Admin** instead of My requests |
| Loading (first paint) | an empty space of the same size where the buttons go. It never shows a wrong button. | same |

- **Account menu** (`AccountMenu`): the button is at most 176 px wide. A long name is cut with "..." (the full name is in the tooltip). It has `aria-haspopup="menu"`, `aria-expanded`, and the menu has `role="menu"` with `role="menuitem"` items. Keyboard: Enter, Space or Arrow Down open it and focus the first item. Arrow Up/Down, Home and End move. Escape closes it and returns the focus to the button. Tab closes it. A click outside closes it.
- Sign out is a form POST button, never a link. After sign out the home page shows a toast: "You have been signed out."
- Admin pages (`AdminShell`) show the theme toggle and **Sign out** in the top bar at every screen width.
- Admin pages show a red banner at the very top while 2-step login is off: "2-step login is OFF. Turn it on before real clients use this site." It must stay visible and cannot be closed.

### Home page hero colors (`HeroArt`, tokens `--hero-*` in `globals.css`)

Static colors only (no blur, filter or blend modes). The animation uses only `translate`, `scale` and `rotate`. **Text and cards never use opacity below 1** (a test checks this). Reduced motion turns every animation off.

| Token | Day | Night |
|---|---|---|
| `hero-card` / `hero-card-border` | #FFFFFF / #E3E8E5 | #243B37 / rgba(255,255,255,.14) |
| `hero-badge-bg` / `hero-badge-fg` ("In progress") | #DAF1EE / #0B5C52 | rgba(94,234,212,.16) / #7EE8D8 |
| `hero-verified-fg` ("Verified") | #14532D | #86E3B1 |
| `hero-check-bg` / `hero-check-fg` | #DCFCE7 / #15803D | rgba(52,211,153,.18) / #6EE7B7 |
| `hero-line-1` / `hero-line-2` (placeholder lines) | #E6EAE7 / #EEF1EF | rgba(255,255,255,.16) / rgba(255,255,255,.10) |
| `hero-peach` (big circle) | #FFE8DC | coral gradient: radial, rgba(255,170,142,.78) to rgba(255,124,102,.56) |
| `hero-teal` (small circle) | #E3F2EF | rgba(94,234,212,.22) |
| `hero-dot` | #FFD23F | #FFD23F |

Night rules (tested in `tests/unit/hero-palette.test.ts`): every shape is at least 1.5 to 1 against the page, labels are at least 4.5 to 1, the peach circle is coral and not brown (lightness at least 40%).

---

## 3. Admin screens

| # | Screen | Route | States / notes |
|---|---|---|---|
| A1 | Login | `/admin/login` | default, wrong details, locked, loading |
| A2 | 2FA code | `/admin/mfa` | enter code, wrong code |
| A3 | 2FA setup | `/admin/mfa/setup` | show QR + secret text, verify code, "add backup device" step |
| A4 | Dashboard | `/admin` | counts, needs-action list (empty state), storage meter (normal / warning / danger), emails today, job warnings |
| A5 | Request list | `/admin/requests` | table (desktop) / cards (phone), filters, empty results, loading, pagination |
| A6 | Request detail | `/admin/requests/[id]` | client info, files (open link, deleted files state), payments, timeline, notes (internal vs client — must look different), status change dialog, email failed + retry |
| A7 | Verify payment dialog | (dialog on A6) | **warning box**, "I found this payment" checkbox, verify, reject with reason |
| A8 | Payment methods | `/admin/settings/payments` | list with on/off and drag order, empty state, owner-only notice for staff |
| A9 | Edit payment method | `/admin/settings/payments/[id]` | form, QR upload preview, **fresh 2FA prompt**, client preview, delete blocked ("used by payments — turn off instead") |
| A10 | Services | `/admin/settings/services` | list, reorder, on/off |
| A11 | Edit service + checklist | `/admin/settings/services/[id]` | service form, checklist items add/edit/reorder/delete, empty checklist state |
| A12 | Site content | `/admin/settings/site` | contact, hours, social links, home texts, privacy notice |
| A13 | File settings | `/admin/settings/files` | retention days, max files, max size, warning % |
| A14 | Admin users (accounts table) | `/admin/settings/users` | table from 1180 px (Account, Role, Status, 2-step, Joined, three-dots actions), cards below it (see 3b); toolbar (search, role filter, status filter, rows per page 10, 25, 50; on a phone: search and a Filters button, 10 rows); pagination "Page X of Y" with Previous and Next; empty state "No accounts found"; Invite button above the table |
| A14a | Actions menu | (menu on each row) | Change role, Reset 2-step login, Turn account off or on, Resend invite. Never a delete. A row you may not touch shows "–"; your own row has no menu |
| A14b | Change role dialog | (dialog on A14) | ONE role dropdown, ONE confirm: "Enter the 6-digit code from YOUR authenticator app." (or the password field when the person has no authenticator yet). Says the person gets an email |
| A14c | Reset 2-step login dialog | (dialog on A14) | Explains what happens (devices removed, signed out everywhere, new device and backup needed, email; "and so does every owner" for an owner), the confirm field, and a field to type the person's email; red "Reset 2-step login" button |
| A14d | Turn off or on dialog, Resend invite dialog, Invite dialog | (dialogs on A14) | Same confirm. Invite: name, email, role (Staff, Admin, Owner only for an owner), method (email invitation or temporary password) |
| A18 | Security page | `/admin/security` | "Your devices" (name, date added, Remove), warning "You have only one device", "Add a device" (QR, secret text, code), unlock box when a code is needed first, "Not available here" without Supabase |
| A19 | 2-step setup (two steps) | `/admin/mfa/setup` | "Step 1 of 2: your authenticator app", "Step 2 of 2: a backup device", device name field, hint "scan the same QR code on two phones", done screen with "Go to the admin area" |
| A20 | Not allowed | `/admin/not-allowed` | "Not allowed" for a client; with `?reason=role` for staff: "This try was written to the activity log", button "Go to Requests" |
| A21 | Staff menu | (sidebar and bottom bar) | Only Requests, Services, Activity (3 items on a phone). Services opens the services page directly. A "Security" link sits in the header for every role. The header shows Owner, Admin or Staff |
| A15 | Activity log | `/admin/activity` | list, filters, highlighted payment-method rows, empty |
| A16 | Export | `/admin/export` | date range, two buttons, "exporting" state, backup reminder |
| A17 | Fresh 2FA dialog | (shared dialog) | used before risky actions |

### 3b. Admin page frame, tables and cards (2026-11-09, branch `fix/admin-uniform-layout`)

One rule for every admin page. Nothing here changes features, permissions or data.

- **One page frame.** `AdminShell` (`src/components/admin/admin-shell.tsx`) is the only place that sets the width. Side padding is 16 px on a phone, 24 px from 640 px and 32 px from 1280 px. The frame is at most 1760 px wide and centered. A page never sets its own width, so the left and right edges are the same on every page.
- **Readable widths inside the frame.** A form (`ActionForm`) is at most 720 px wide. Intro text is at most `max-w-prose`. Two-column layouts (Site content, File settings, Payment method, Service edit, Security, Request details, Dashboard) start at 1280 px, where there is room. Below 1280 px they are one column.
- **Settings cards.** 1 column on a phone, 2 columns from 640 px, 3 from 1280 px, 4 from 1536 px (a card is never narrower than about 280 px). Owner and Admin also get an Export card here.
- **Table or cards: one breakpoint, 1180 px.** From 1180 px a list is a table, below it a list of cards (`TABLE_ONLY`, `CARDS_ONLY`, `TableBox`, `CardList` in `src/components/admin/data-views.tsx`). We found 1180 px by testing: with the 256 px sidebar and 32 px padding, the Admin users table needs about 860 px to show every word on one line.
- **Table rules.** Cells never wrap (`whitespace-nowrap`). Cell padding is 16 px left and right. Header labels are left-aligned like the cells, numbers are right-aligned. An email longer than 40 characters is cut with "..." and the full value is in a tooltip (`Clip`). If a table is still wider than its box, it scrolls sideways inside the box, never the whole page.
- **Admin users table.** Columns: Account (name, with a small "You" tag on your own row, and the email under it in smaller muted text), Role, Status, 2-step, Joined, and an actions column with a three-dots button (accessible name "Actions for NAME"). Your own row has no actions button. Status labels in the table: Invited, Active, Turned off, Unverified, with tooltips for Invited and Unverified.
- **Cards.** Same data and same actions as the table. Admin users card: name in bold (and "You"), email in muted text that may wrap, a three-dots button at the top right (44 x 44 px), role and status badges (the long label, for example "Invited with temporary password", is visible text because a phone has no hover), then "2-step login" and "Joined" in two columns. Requests and Activity use the same pattern, and a Requests card is one big link.
- **Filters on a phone.** A search box, a search button and a "Filters" button. The button opens a panel (Role and Status; Requests and Activity have their own fields) with an Apply button. "Rows per page" is not shown on a phone and a phone asks for 10 rows (`FilterPanel`, `AccountsToolbar`).
- **Pagination on a phone.** Large Previous and Next buttons (44 px) and "Page 1 of 3".
- **Bottom bar.** The bar is 60 px tall. The page has bottom padding of the bar height plus the device safe area, so the last card is never hidden. Export is not in the bar (4 items is the most that fits), so Owner and Admin open it from an "Export" card on the Settings page. Staff keep Requests, Services, Activity.
- **Sidebar collapse** (optional) was not built: it needs saved state and tooltips for the icons, which is a bigger change than this layout fix.

### 3c. Badge and Card rules (2026-11-09, branch `fix/card-overflow`)

Nothing may stick out of its card, overlap its neighbor or be cut off by accident. These rules are in the shared parts, so a page never has to fix it again.

- **One pill: `Badge`** (`src/components/ui/badge.tsx`). Every status, role, tier, "Required / Optional" and "You" pill uses it (`StatusBadge` is `Badge` plus an icon and a color). Never hand-make a pill with `rounded-full` and a background.
  - Width: only as wide as its words, never wider than its parent (`max-w-full`).
  - A long label wraps onto a second line (line height 20 px). It is never cut off and never overflows. The icon stays level with the first line.
  - Long words break (`overflow-wrap: anywhere`). Padding 12 px left and right, text 14 px bold. Colors are unchanged.
  - Put several pills in a row that can wrap (`flex-wrap`).
- **One card: `Card`** (`src/components/ui/card.tsx`). `min-w-0` (it can shrink inside a grid or flex row) and `overflow-wrap: anywhere` (a long email or name breaks inside the card). Do not add `overflow-hidden` to hide a problem: it cuts text.
- **Button:** `max-w-full`, so a long label wraps inside the button.
- **Grids:** a grid that changes columns at a breakpoint starts with `grid-cols-1`. Without it the single column grows to the width of its longest word.
- **Button rows:** `flex-col` on a phone and `sm:flex-row sm:flex-wrap` from 640 px.
- **Status cards (admin Dashboard):** the grid follows the width of the content area (container query), not the screen: 2 columns, 3 columns from 640 px, 5 columns from 1100 px (each card at least 210 px, so never 4 + 1). Cards in a row have the same height and 16 px padding.
- **Cut-off text ("..."):** only where a single line is needed (the header name, a table cell, the account menu). It always has the full text in a `title` tooltip. On a phone, the same text is shown in full in the card list.
- **Text size:** never below 14 px to make something fit.
- **Admin header:** "Sign out" is an icon only under 380 px (the words stay for screen readers).
- **Test:** `tests/e2e/layout.spec.ts` (see `PROGRESS.md`, "Card, pill and button overflow fix") fails when a page breaks these rules.

---

## 4. Components

| Component | Variants / states |
|---|---|
| Button | primary, secondary, outline, ghost, danger; sizes sm/md/lg; loading; disabled |
| Text input, textarea, select | default, focus, error with message, disabled, help text |
| Phone input | +63 prefix |
| Money input | ₱ prefix, numeric keyboard |
| Checkbox (consent, confirm) | unticked, ticked, error |
| Stepper (request steps) | 5 steps; current, done, upcoming; compact on phone |
| Tracking code display | big monospace text + copy button + copied state |
| File upload item | waiting, uploading (%), done, failed (retry), removing |
| Checklist item with attach | no files, has files, required mark |
| Payment method card | QR image, account name (large), number + copy, instructions, save QR |
| Receipt preview | image with zoom; on phone above the form |
| OCR field label | "Read from image — please check", "Not sure — please check" |
| Warning box | info, warning, danger (used for "check in your own app") |
| Status badge | 9 statuses, color + text |
| Timeline | vertical list of status + date + optional message |
| Backup contact block | Messenger button, Viber button (text + simple icon, not brand logos unless allowed by their brand rules) |
| Storage meter | normal, warning, danger |
| Stat card | number + label (dashboard) |
| Data table / card list | desktop table, phone cards, empty, loading skeleton |
| Dropdown menu | closed button "Actions", open list of items (each at least 44 px tall), keyboard and Escape |
| Dialog / sheet | confirm, form, danger |
| Toast | success, error |
| Empty state | icon + text + optional action |
| Skeleton loaders | text lines, cards, table rows |
| Header / footer / mobile menu | public and admin versions |
| Turnstile area | space for the widget, and its error message |

---

## 5. Content notes for the designer

- All text in plain English (language choice open — see PROGRESS.md).
- Use placeholder services from the brief. **Do not write requirements or fees** in mockups — use "Requirement 1", "Requirement 2".
- Payment QR mockups must be clearly fake ("SAMPLE QR").
- Use fake names and fake numbers in all mockups.
