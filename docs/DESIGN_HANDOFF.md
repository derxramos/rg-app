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
| A14 | Admin users | `/admin/settings/users` | list, invite dialog, role, turn off, "last owner" blocked state |
| A15 | Activity log | `/admin/activity` | list, filters, highlighted payment-method rows, empty |
| A16 | Export | `/admin/export` | date range, two buttons, "exporting" state, backup reminder |
| A17 | Fresh 2FA dialog | (shared dialog) | used before risky actions |

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
