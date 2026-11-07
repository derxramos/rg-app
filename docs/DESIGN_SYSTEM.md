# DESIGN_SYSTEM.md

Handoff for developers. Design for **RG'S BOOKKEEPING AND ACCOUNTING SERVICES**: public website and admin app.
Source of truth is the Design System artifact (tokens, component previews, 26 screen boards). This file tells you how to put it into Next.js 16, Tailwind CSS and shadcn/ui.

Language: plain English. Mobile first (390 px), then desktop (1440 px). Light mode only for v1.

---

## 1. Brand

**Logo:** a rounded tile with an **R** and a **G** drawn from simple strokes. The bar of the G is the accent color. It is original to this business and uses no agency or bank imagery. Files: `assets/Logos/rg-monogram.svg` and `rg-monogram-inverse.svg` (copy to `public/brand/`). The wordmark is live text: "RG'S" in Plus Jakarta Sans Bold with "BOOKKEEPING & ACCOUNTING" small caps below it.

### Recommended palette: "Teal Ledger"

| Role | Token | Hex | Used for |
|---|---|---|---|
| Primary | `primary` | #0B6158 | Buttons, links, active nav, focus ring, logo |
| Primary soft | `primary-soft` | #E3F2EF | Tints, secondary buttons, selected rows |
| Accent | `brand-accent` | #FF7B47 | One bright highlight (hero shape, G bar). Never as text |
| Call to action | `cta` / `cta-hover` / `on-cta` | #C2410C / #9A3412 / #FFFFFF | The one orange button style (`accent` variant). White text on dark orange: 5.2:1 at rest, 7.3:1 on hover (4.5:1 rule met). Focus ring is the brand teal. Same in day and night mode. (Before 2026-11-07 it was #FF7B47 with off-white text at 2.4:1.) |
| Highlight | `highlight` | #FFD23F | Small marks, illustration shapes |
| Success | `success` | #167A47 | Verified, done |
| Warning | `warning` | #F5A524 | Check, caution (text uses `warning-ink` #7A4A00) |
| Danger | `danger` | #C62F2F | Delete, reject |
| Info | `info` | #1F62B4 | Notes and hints |
| Surface | `surface` | #FFFFFF | Page and cards |
| Surface subtle | `surface-subtle` | #F6F7F5 | Section background, admin page |
| Text | `text` | #121C1B | Headings and body |
| Text muted | `text-muted` | #4C5957 | Help text, captions |

### Alternative palette: "Harbor Navy"

Same status colors and layout. Only these change:

| Token | Hex |
|---|---|
| `primary` | #17386B |
| `primary-hover` | #112B52 |
| `primary-soft` | #E6ECF6 |
| `primary-ink` | #0F2A52 |
| `brand-accent` | #00B386 (text on it: #032B20) |
| `highlight` | #FFB400 |
| `surface-subtle` | #F5F7FB |
| `text` | #0F1A2E |
| `text-muted` | #4A5670 |
| `input-border` | #7B879B |

Switch with `data-theme="alt"` on `<html>`. 112 text and control color pairs were checked by script in both palettes: all pass WCAG AA (4.5:1 text, 3:1 controls and focus ring).

---

## 2. Design tokens as CSS variables

Put this in `src/app/globals.css`. Colors change with the theme, so they are CSS variables. Everything that never changes (spacing, radius, type, shadow) goes in the Tailwind theme in section 3.

Note on the name `accent`: shadcn/ui uses `--accent` for a soft hover background. So our coral accent is named **`brand-accent`** in the app.

```css
:root, [data-theme="light"] {
  --surface: #FFFFFF;
  --surface-subtle: #F6F7F5;
  --surface-sunken: #ECEEEA;
  --border: #E2E5E1;
  --input-border: #7F8B88;
  --text: #121C1B;
  --text-muted: #4C5957;
  --primary: #0B6158;
  --primary-hover: #084D46;
  --primary-soft: #E3F2EF;
  --primary-ink: #08463F;
  --on-primary: #FFFFFF;
  --brand-accent: #FF7B47;
  --brand-accent-soft: #FFE8DC;
  --brand-accent-ink: #8F3410;
  --on-brand-accent: #2B1305;
  --cta: #C2410C;
  --cta-hover: #9A3412;
  --on-cta: #FFFFFF;
  --highlight: #FFD23F;
  --on-highlight: #2A2100;
  --success: #167A47;
  --success-soft: #DFF3E7;
  --success-ink: #0F5A33;
  --on-success: #FFFFFF;
  --warning: #F5A524;
  --warning-soft: #FFF1D6;
  --warning-ink: #7A4A00;
  --on-warning: #2B1A00;
  --danger: #C62F2F;
  --danger-soft: #FCE4E4;
  --danger-ink: #8F1D1D;
  --on-danger: #FFFFFF;
  --info: #1F62B4;
  --info-soft: #E1EEFB;
  --info-ink: #174C8C;
  --on-info: #FFFFFF;
  --ring: #0B6158;
  --overlay: #0f1b1a99;
  --status-draft-bg: #ECEEEA;
  --status-draft-fg: #3F4B49;
  --status-submitted-bg: #E1EEFB;
  --status-submitted-fg: #174C8C;
  --status-payment-submitted-bg: #EDE6FB;
  --status-payment-submitted-fg: #4A2C99;
  --status-under-review-bg: #FFF1D6;
  --status-under-review-fg: #7A4A00;
  --status-waiting-for-client-bg: #FFE8DC;
  --status-waiting-for-client-fg: #8F3410;
  --status-in-progress-bg: #DAF1EE;
  --status-in-progress-fg: #08463F;
  --status-completed-bg: #DFF3E7;
  --status-completed-fg: #0F5A33;
  --status-cancelled-bg: #FCE4E4;
  --status-cancelled-fg: #8F1D1D;
  --status-payment-verified-bg: #EAF3CF;
  --status-payment-verified-fg: #3F5B0A;
}

/* Alternative palette. Only values that differ. */
[data-theme="alt"] {
  --surface: #FFFFFF;
  --surface-subtle: #F5F7FB;
  --surface-sunken: #E8ECF3;
  --border: #E0E5EE;
  --input-border: #7B879B;
  --text: #0F1A2E;
  --text-muted: #4A5670;
  --primary: #17386B;
  --primary-hover: #112B52;
  --primary-soft: #E6ECF6;
  --primary-ink: #0F2A52;
  --on-primary: #FFFFFF;
  --brand-accent: #00B386;
  --brand-accent-soft: #D9F5EC;
  --brand-accent-ink: #006B50;
  --on-brand-accent: #032B20;
  --highlight: #FFB400;
  --on-highlight: #2A1C00;
  --ring: #17386B;
  --overlay: #0f1a2e99;
}
```

Status colors always come in a pair: `status-<name>-bg` and `status-<name>-fg`. See section 5.

---

### 2b. Night mode "Teal Ledger Night"

A day and night toggle (moon or sun button in the public and admin headers). Code: `:root[data-theme="dark"]` in `src/app/globals.css`, `src/lib/theme.ts`, `src/components/shared/theme-toggle.tsx`.

- **How it is chosen:** the saved choice (browser localStorage key `rg-theme`), otherwise the phone or computer setting. A tiny script in `<head>` sets `data-theme` before the first paint, so there is no flash. No cookie and no server work, so pages stay static.
- **Same roles, new values.** The page is the darkest layer. Cards are a little lighter than the page, with a lighter border and darker, stronger shadows. Text is soft white, never pure white.
- **Brand colors get lighter on dark:** teal `#3db8a7` (links, buttons), ink `#8ee0d3` (headings), orange `#ff8a5c`. The orange call-to-action button and the yellow dot keep their day colors.
- **Soft boxes become deep tints** (for example the home page circles: orange `#3a2318`, teal `#14332f`) so the animations stay calm.
- **Status badges** have their own night pairs (all 9).
- **QR pictures and the 2FA QR stay on a white tile**, so they scan.
- **Rule:** every text pair is at least 4.5 to 1, input borders and the focus ring 3 to 1. Checked by `tests/unit/dark-palette.test.ts`.
- The Cloudflare spam box follows the device setting only.
- **Hero picture colors** are their own tokens (`--hero-*`), see `docs/DESIGN_HANDOFF.md` ("Home page hero colors").

## 3. Tailwind theme (Tailwind v4, CSS-first)

```css
@import "tailwindcss";

/* shadcn/ui names point to our roles */
:root {
  --background: var(--surface);
  --foreground: var(--text);
  --card: var(--surface);
  --card-foreground: var(--text);
  --popover: var(--surface);
  --popover-foreground: var(--text);
  --primary-foreground: var(--on-primary);
  --secondary: var(--primary-soft);
  --secondary-foreground: var(--primary-ink);
  --muted: var(--surface-sunken);
  --muted-foreground: var(--text-muted);
  --accent: var(--primary-soft);
  --accent-foreground: var(--primary-ink);
  --destructive: var(--danger);
  --destructive-foreground: var(--on-danger);
  --input: var(--input-border);
}

@theme inline {
  --color-background: var(--surface);
  --color-foreground: var(--text);
  --color-card: var(--surface);
  --color-card-foreground: var(--text);
  --color-popover: var(--surface);
  --color-popover-foreground: var(--text);
  --color-primary-foreground: var(--on-primary);
  --color-secondary: var(--primary-soft);
  --color-secondary-foreground: var(--primary-ink);
  --color-muted: var(--surface-sunken);
  --color-muted-foreground: var(--text-muted);
  --color-accent: var(--primary-soft);
  --color-accent-foreground: var(--primary-ink);
  --color-destructive: var(--danger);
  --color-destructive-foreground: var(--on-danger);
  --color-border: var(--border);
  --color-input: var(--input-border);
  --color-ring: var(--ring);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-soft: var(--primary-soft);
  --color-primary-ink: var(--primary-ink);
  --color-brand-accent: var(--brand-accent);
  --color-brand-accent-soft: var(--brand-accent-soft);
  --color-brand-accent-ink: var(--brand-accent-ink);
  --color-on-brand-accent: var(--on-brand-accent);
  --color-cta: var(--cta);
  --color-cta-hover: var(--cta-hover);
  --color-on-cta: var(--on-cta);
  --color-highlight: var(--highlight);
  --color-on-highlight: var(--on-highlight);
  --color-surface-subtle: var(--surface-subtle);
  --color-surface-sunken: var(--surface-sunken);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-success-ink: var(--success-ink);
  --color-on-success: var(--on-success);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-warning-ink: var(--warning-ink);
  --color-on-warning: var(--on-warning);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-danger-ink: var(--danger-ink);
  --color-on-danger: var(--on-danger);
  --color-info: var(--info);
  --color-info-soft: var(--info-soft);
  --color-info-ink: var(--info-ink);
  --color-on-info: var(--on-info);
  --color-overlay: var(--overlay);
  --color-status-draft-bg: var(--status-draft-bg);
  --color-status-draft-fg: var(--status-draft-fg);
  --color-status-submitted-bg: var(--status-submitted-bg);
  --color-status-submitted-fg: var(--status-submitted-fg);
  --color-status-payment-submitted-bg: var(--status-payment-submitted-bg);
  --color-status-payment-submitted-fg: var(--status-payment-submitted-fg);
  --color-status-under-review-bg: var(--status-under-review-bg);
  --color-status-under-review-fg: var(--status-under-review-fg);
  --color-status-waiting-for-client-bg: var(--status-waiting-for-client-bg);
  --color-status-waiting-for-client-fg: var(--status-waiting-for-client-fg);
  --color-status-in-progress-bg: var(--status-in-progress-bg);
  --color-status-in-progress-fg: var(--status-in-progress-fg);
  --color-status-completed-bg: var(--status-completed-bg);
  --color-status-completed-fg: var(--status-completed-fg);
  --color-status-cancelled-bg: var(--status-cancelled-bg);
  --color-status-cancelled-fg: var(--status-cancelled-fg);
}

@theme {
  /* Font: next/font sets --font-plus-jakarta on <html> */
  --font-sans: var(--font-plus-jakarta), system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* Type scale: size / line height. Weights: 400 and 700 only. */
  --text-xs: 0.75rem;   --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;  --text-sm--line-height: 1.25rem;
  --text-base: 1rem;    --text-base--line-height: 1.5rem;
  --text-lg: 1.125rem;  --text-lg--line-height: 1.625rem;
  --text-xl: 1.375rem;  --text-xl--line-height: 1.875rem;
  --text-2xl: 1.875rem; --text-2xl--line-height: 2.375rem;
  --text-3xl: 2.5rem;   --text-3xl--line-height: 2.875rem;
  --text-4xl: 3.5rem;   --text-4xl--line-height: 3.75rem;   /* home hero only */

  /* Spacing: 4 px base. Tailwind's p-1 = 4px, p-2 = 8px ... already match. */
  --spacing: 0.25rem;

  /* Radius */
  --radius-sm: 6px;    /* checkbox, chips */
  --radius-md: 10px;   /* buttons, inputs, toasts */
  --radius-lg: 16px;   /* cards, dialogs on phone */
  --radius-xl: 24px;   /* big bento cards, modal */

  /* Shadows (light, neutral) */
  --shadow-sm: 0 1px 2px #0f1b1a14, 0 1px 1px #0f1b1a0a;
  --shadow-md: 0 8px 24px #0f1b1a14, 0 2px 6px #0f1b1a0d;
  --shadow-lg: 0 24px 64px #0f1b1a29, 0 4px 12px #0f1b1a14;

  /* Motion */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);

  /* Breakpoints */
  --breakpoint-sm: 40rem;   /* 640 */
  --breakpoint-md: 48rem;   /* 768 */
  --breakpoint-lg: 64rem;   /* 1024 */
  --breakpoint-xl: 80rem;   /* 1280 */
}
```

If the project still uses Tailwind v3, move the same values into `tailwind.config.ts` under `theme.extend` (`colors` as `"hsl(var(--x))"` does not apply: our variables are hex, so use `"var(--x)"` directly).

### Fonts: two files only

```ts
// src/app/fonts.ts
import localFont from "next/font/local";
export const plusJakarta = localFont({
  src: [
    { path: "../../public/fonts/PlusJakartaSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/PlusJakartaSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plus-jakarta",
  display: "swap",
});
```

- The two files (14 KB each) are in the Design System under `fonts/`. They include the **peso sign ₱** (U+20B1). Plus Jakarta Sans is free (SIL Open Font License).
- If you use `next/font/google` instead, set `subsets: ["latin", "latin-ext"]` and **do not list weights** (variable font). ₱ is in `latin-ext`. Test that ₱ shows on the payment pages.
- Use only `font-normal` (400) and `font-bold` (700).
- Tracking code uses `font-mono` (system monospace, no download).

### Layout values

| Name | Value | Use |
|---|---|---|
| Page max width | 1200 px (`max-w-[1200px]`) | Public pages |
| Page side padding | 20 px phone, 32 px from `md` | `px-5 md:px-8` |
| Form column | 640 px (900 px on the receipt step) | Request flow |
| Header height | 64 px | Public and admin |
| Admin sidebar | 256 px from `lg` | |
| Tap target | 44 × 44 px minimum | Buttons, inputs, checkbox rows, nav items |

### Motion rules

- Durations: 120 ms (hover, press), 200 ms (dropdown, toast, tab), 320 ms (dialog, sheet, progress). Easing `ease-standard`.
- Move only `opacity`, `transform`, `background-color`, `box-shadow`.
- Respect `prefers-reduced-motion`: Tailwind `motion-reduce:transition-none motion-reduce:animate-none`. Skeletons and spinners stop moving.
- No page transitions, no parallax, no auto-playing animation.

### Focus ring

2 px `ring` color with a 2 px white gap. Never remove it.

```tsx
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
```

### Icons

Lucide (`lucide-react`). Stroke 2 px, 20 px in buttons, 16 px beside small text, 24 px in tiles. Import icons one by one (`import { Send } from "lucide-react"`) so the bundle stays small. An icon never carries meaning alone.

---

## 4. Component map: design → shadcn/ui

| Design component | shadcn/ui | What to add or change |
|---|---|---|
| Button | `Button` | Variants: default, secondary (`primary-soft`), outline, ghost, destructive. Add `accent` variant (`bg-cta text-on-cta font-semibold hover:bg-cta-hover`, the one orange button). Sizes: sm 40 (44 on phone), md 44, lg 52. Add `loading` prop with spinner |
| Input, Phone input, Money input | `Input`, `Label`, `Form` | `min-h-11`, `text-base`. Prefix slot for `+63` and `₱`. Error line with icon |
| Checkbox, Switch | `Checkbox`, `Switch` | 24 px box inside a 44 px tall row |
| Select | `Select` (use native `<select>` on phone) | Same height and border as Input |
| Textarea | `Textarea` | Min 104 px. Counter in the help text |
| File dropzone, file row | custom on `Card`, `Progress`, `Button` | One file at a time. States: waiting, uploading, done, failed |
| Stepper | custom `ol` (+ `Progress` for compact) | 5 steps. Compact text bar under 640 px |
| Status badge | `Badge` + `status` prop | Map in section 5 |
| Card, bento tile | `Card` | `rounded-lg border shadow-sm p-5 md:p-6`. Tint variants |
| Stat card, storage meter | `Card`, `Progress` | Meter turns yellow at warning %, red at 95 % |
| Table / phone cards | `Table`, `Pagination` (+ `@tanstack/react-table`) | Show `<Table>` from `md`, cards below |
| Tabs | `Tabs` | Segmented list for filters, underline for detail pages |
| Modal / sheet | `Dialog`, `AlertDialog`, `Sheet` (`side="bottom"` on phone) | Fresh 2FA dialog is a shared `Dialog` |
| Toast | `Sonner` | Icon and words. 5 s (8 s for errors) |
| Empty, loading, error states | `Skeleton` + custom `EmptyState` | Error state always includes the Messenger/Viber block |
| Warning box | `Alert` | Variants info, warning, danger, success; `strong` for payment checks |
| Payment QR card | `Card`, `RadioGroup`, `Button` | Account name large (24 px bold) |
| OCR confirm form | `Form`, `Input`, `Select`, `Checkbox`, `Progress`, `Alert` | Image left, fields right; image never uploaded |
| Tracking timeline, tracking code | custom `ol`, `Button` | Code in `font-mono` |
| Header, footer, mobile menu | `NavigationMenu`, `Sheet` | Menu button under 1024 px |
| Admin sidebar, bottom bar | `Sidebar` (or custom) | Bottom bar only on phone, 4 items, 60 px tall |
| Backup contact block | custom `Button` (outline, rounded-full) | Text + Lucide icon. No brand logos. Hidden when link is empty |

---

## 5. Request status badges

All 9 statuses (8 from FEATURES.md, plus **Payment verified** from DATABASE.md). Each has a pair of colors, an icon and words. Never use color alone.

| Status | Token pair | Icon |
|---|---|---|
| Draft | `status-draft-bg` / `status-draft-fg` | `file-pen-line` |
| Submitted | `status-submitted-bg` / `status-submitted-fg` | `send` |
| Payment submitted | `status-payment-submitted-bg` / `status-payment-submitted-fg` | `receipt-text` |
| Payment verified | `status-payment-verified-bg` / `status-payment-verified-fg` (lime: #EAF3CF / #3F5B0A) | `badge-check` |
| Under review | `status-under-review-bg` / `status-under-review-fg` | `search` |
| Waiting for client | `status-waiting-for-client-bg` / `status-waiting-for-client-fg` | `hourglass` |
| In progress | `status-in-progress-bg` / `status-in-progress-fg` | `loader-circle` |
| Completed | `status-completed-bg` / `status-completed-fg` | `circle-check` |
| Cancelled | `status-cancelled-bg` / `status-cancelled-fg` | `ban` |

```tsx
const STATUS = {
  draft: { label: "Draft", icon: FilePenLine },
  submitted: { label: "Submitted", icon: Send },
  "payment-submitted": { label: "Payment submitted", icon: ReceiptText },
  "under-review": { label: "Under review", icon: Search },
  "waiting-for-client": { label: "Waiting for client", icon: Hourglass },
  "in-progress": { label: "In progress", icon: LoaderCircle },
  completed: { label: "Completed", icon: CircleCheck },
  cancelled: { label: "Cancelled", icon: Ban },
} as const;

// className = `bg-status-${key}-bg text-status-${key}-fg`
// Tailwind cannot see built class names. Write the full class names in a map, not template strings.
```

Payment states: Not paid yet (neutral), Pending check (`warning-soft`), Verified (`success-soft`), Rejected (`danger-soft`). How a value was entered: OCR, OCR edited, Manual.

---

## 6. Screen map: design → route

Each board shows the phone (390) and desktop (1440). The design uses container queries so one markup adapts; in the app use Tailwind `sm:`, `md:`, `lg:` (they match 640, 768, 1024).

| Board | Route | Feature | Notes |
|---|---|---|---|
| ScreenHome | `/` | P1, P13 | Services section empty state |
| ScreenServices | `/services` | P2 | Loading skeleton, empty state |
| ScreenServiceDetail | `/services/[slug]` | P3 | Empty checklist text is exact |
| ScreenHowItWorks | `/how-it-works` | P4 | |
| ScreenContact | `/contact` | P5, P13 | Send-failed state shows backup links |
| ScreenPrivacy | `/privacy` | P6 | Version and date badges |
| ScreenRequestDetails | `/request` | P7 | Consent never pre-ticked |
| ScreenTrackingCode | `/request/[id]/code` | P7 | |
| ScreenRequestUpload | `/request/[id]/documents` | P8 | |
| ScreenRequestPayment | `/request/[id]/payment` | P9 | |
| ScreenRequestReceipt | `/request/[id]/receipt` | P10 | OCR states |
| ScreenRequestReview | `/request/[id]/review` | P11 | |
| ScreenRequestDone | `/request/[id]/done` | P11 | |
| ScreenTrackForm | `/track` | P12, P13 | Locked state |
| ScreenTrackResult | `/track/result` | P12 | Pay now, Upload more |
| ScreenExpiredAndNotFound | `/request/expired`, 404, error | P13 | |
| ScreenAdminLogin | `/admin/login` | A1 | |
| ScreenAdminMfa | `/admin/mfa`, `/admin/mfa/setup`, fresh 2FA dialog | A1 | |
| ScreenAdminDashboard | `/admin` | A2 | |
| ScreenAdminRequests | `/admin/requests` | A3 | |
| ScreenAdminRequestDetail | `/admin/requests/[id]` | A4, A12 | |
| ScreenAdminVerifyPayment | dialog on request detail | A5 | |
| ScreenAdminPaymentMethods | `/admin/settings/payments`, `/[id]` | A6 | Owner only |
| ScreenAdminServices | `/admin/settings/services`, `/[id]` | A7 | |
| ScreenAdminSiteContent | `/admin/settings/site`, `/files` | A8 | |
| ScreenAdminActivity | `/admin/activity` | A10 | |

Not drawn yet: Admin users (A9), Export (A11 / A16), and the full Files settings page. They reuse the same components (list, form, dialog, fresh 2FA). See questions.

---

## 7. Notes for developers

1. **Money.** Store centavos. Show with `new Intl.NumberFormat("en-PH", {{ style: "currency", currency: "PHP" }}).format(centavos / 100)` → `₱1,250.00`. The money input shows a fixed `₱` prefix. Check the glyph in the font after each font change.
2. **Time.** Store UTC. Show in `Asia/Manila` (`timeZone: "Asia/Manila"`).
3. **Phone.** Input shows `+63` prefix and 10 digits; store `+63XXXXXXXXXX`.
4. **Text can grow 30 %** (Filipino translation). No fixed widths on text. Use `min-w-0`, `flex-wrap`, `gap`. Buttons grow in width, never clip. Badges do not wrap in one line; allow the row to wrap. Test with a pseudo-language that makes every string 30 % longer.
5. **Touch targets.** Every button, input, checkbox row and nav item is at least 44 px tall. Small buttons are 40 px on desktop and 44 px on phone.
6. **Contrast.** Text on soft backgrounds uses the `*-ink` token (for example `text-warning-ink` on `bg-warning-soft`). Never put text on `brand-accent` or `warning` except `on-brand-accent` and `on-warning`. Orange buttons use `cta` with `on-cta` (white on #C2410C, 5.2:1).
7. **Status is never color only.** Icon + words, always.
8. **Light pages.** No photos. Illustrations are CSS and SVG (mini UI cards, discs, pills). No hero video. Two font files, 28 KB in total. Keep client JavaScript small; load Tesseract.js only when the client taps "Read my receipt".
9. **Receipt image.** Show it with an object URL in the browser only. Never upload or store it. Revoke the URL when done.
10. **Names as text.** Write SSS, Pag-IBIG, PhilHealth, BIR, GCash, Maya, BDO as plain text. Do not draw their logos. Messenger and Viber buttons use `MessageCircle` and `Phone` icons.
11. **Admin must always warn about OCR.** The strong warning box sits above Verify and cannot be hidden. Verify stays disabled until "I found this payment in our account." is ticked.
12. **Sample content.** Mockups use fake names, fake numbers, "Requirement 1, 2, 3", and a QR picture that says SAMPLE QR. Never ship them.
13. **Internal notes vs client messages.** Yellow dashed box with a lock icon = staff only. Blue box with a send icon = shown to the client.
14. **Accessibility.** Focus ring on every control. Error text under the field with an icon. Dialogs trap focus. Toasts are `role="status"`.

### Figma-style structure (if you rebuild this in Figma)

| Figma page | Contents |
|---|---|
| Foundations | Variable collections: **Color** (modes: Teal, Navy), **Spacing**, **Radius**, **Type**, **Shadow** |
| Components | One component set per row in section 4. Variant names: `Button / Variant=Primary, Size=MD, State=Hover` |
| Public screens | Frames 390 and 1440 for each board |
| Admin screens | Frames 1440 and 390 for each board |

---

## 8. Questions (nothing was changed in features or flows)

1. DESIGN_HANDOFF.md says **9 request statuses**. FEATURES.md names **8**. What is the 9th? It needs one more color pair and icon. **Answered:** the 9th is `payment_verified`. It has its own badge: lime green pair and the `badge-check` icon (it must not look like Completed or In progress).
2. DESIGN_HANDOFF.md asks for "big monospace" for the tracking code. I used the system monospace font (no file) so the site stays at 2 font files. Is that OK?
3. To keep **2 font files**, only weights 400 and 700 are used (no semibold). Is that OK?
4. Which palette do you choose: Teal Ledger or Harbor Navy?
5. Open question 2 in PROGRESS.md (can staff verify payments?). The design shows Verify to everyone who sees the request. If only the owner may verify, staff will see the payment card with no Verify button and a short owner-only note.
6. Should I draw the screens that are not in this round: Admin users, Export, and the Files settings page?
7. Public site language is still open. The design leaves 30 % extra room, so English + Filipino will fit.
8. The Turnstile widget is a labelled empty area in the mockups. Cloudflare draws the real widget; only its area and error text are designed.
