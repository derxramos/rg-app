# OCR_PAYMENTS.md

Receipt reading (OCR = Optical Character Recognition: software that turns text in a picture into real text).

**Main idea:** OCR only saves typing. It does not prove a payment. The owner always checks the payment in her real GCash / Maya / BDO account.

---

## 1. Rules

1. Tesseract.js **7.0.x**, in the **browser only**.
2. The receipt image **never leaves the phone**. Not uploaded, not stored. We save only: reference number, amount, date, payment method.
3. Amount and reference number are read with a **digits-only character list**.
4. One small parser per payment app. Adding a new app = one new file + test fixtures.
5. The image is shown next to the fields. Every field is editable. Client must confirm.
6. Manual typing **always** works.
7. Server checks every value again. Reference number unique per payment method.

---

## 2. Loading (slow data friendly)

- Tesseract.js is loaded **only when the client taps "Read my receipt"** (dynamic `import()`). Pages without OCR do not download it.
- Before loading, show: "This needs about X MB of data. Or type the values yourself." (X measured in Phase 4.)
- Use the English "fast" language data and the default jsDelivr CDN (free, and it does not use our hosting traffic). The browser caches it for next time.
- One worker, created once, and closed when the client leaves the page.
- Time limit: if reading takes more than 30 seconds, stop and show the manual form with a message.
- If the browser has no WebAssembly support, hide the OCR button and show the manual form only.

---

## 3. Image preparation (in the browser)

Before OCR:
1. Fix rotation from photo info (EXIF).
2. Resize so the width is about 1000–1500 px (screenshots are often bigger; smaller = faster).
3. Convert to grayscale and raise contrast.
4. Optional: crop away the phone status bar at the top.

All done with `<canvas>`. Nothing leaves the device.

---

## 4. OCR passes

```
Pass 1 — full text
  recognize(image) → text + words with positions (bounding boxes)

Parser — find labels
  parser.findFields(pass1) → for each field:
     { value guess from text, region (rectangle) near the label }

Pass 2 — digits only (for amount and reference)
  setParameters({ tessedit_char_whitelist: "0123456789.," })
  recognize(image, { rectangle: region }) for each region
  then set the whitelist back for the next run

Merge
  prefer pass-2 value if it matches the expected format,
  else pass-1 value, else empty
```

Why two passes: a digits-only list on the **whole** receipt would break the labels ("Ref No." would become digits). So we use labels from pass 1 to find **where** the numbers are, then read only those areas with digits only.

Some receipts have letters in the reference number. A parser can set its own character list for its reference field (for example digits + capital letters).

---

## 5. Parser design

```ts
// src/ocr/parsers/types.ts
export type OcrWord = { text: string; confidence: number; bbox: Box };
export type OcrPage = { text: string; lines: { text: string; words: OcrWord[]; bbox: Box }[] };

export type FieldGuess = {
  value: string | null;      // best guess from pass 1
  region: Box | null;        // where pass 2 should look
  confidence: number;        // 0..1
};

export type ReceiptParser = {
  key: "gcash" | "maya" | "bdo" | string;
  displayName: string;
  // quick check: does this text look like this app's receipt?
  matches(page: OcrPage): number;          // score 0..1
  findFields(page: OcrPage): {
    reference: FieldGuess;
    amount: FieldGuess;
    date: FieldGuess;
  };
  referenceCharList: string;               // e.g. "0123456789"
  normalizeReference(raw: string): string; // remove spaces, fix O→0 etc.
  referencePattern: RegExp;                // e.g. /^\d{13}$/ (set after we see real samples)
};
```

- `src/ocr/parsers/index.ts` holds a list `PARSERS = [gcash, maya, bdo]`. Adding an app = write a file, add it to the list, add fixtures.
- Each parser is **pure** (no Tesseract, no browser). Input = OCR result object. Output = field guesses. This makes unit tests easy and fast.
- Shared helpers in `src/ocr/parsers/shared.ts`:
  - `findLabel(page, /ref(erence)?\s*(no|number)/i)` → line + position
  - `regionRightOf(bbox)`, `regionBelow(bbox)`
  - `parseAmount("₱1,250.00")` → `125000` centavos
  - `parseDate("Nov 6, 2026 9:37 AM")` → `2026-11-06` (many formats)
  - `fixDigitLookalikes("1O5S")` → `"1055"` (O→0, o→0, S→5, l/I→1, B→8, Z→2) — **only in digit fields**
- `payment_methods.parser_key` links a payment method to a parser. If null → manual only.
- If the client's chosen method's parser gives a low `matches` score, show: "This does not look like a [GCash] receipt. Please check the values carefully."

**Real formats are unknown for now.** We will collect real sample receipts later. Until then, parsers have placeholder label patterns, and tests use made-up text that is clearly marked as "fake sample".

---

## 6. Client form

```
┌───────────────────────────┬──────────────────────────────┐
│  [receipt image preview]   │  Payment method: [GCash ▼]   │
│  (tap to zoom)             │  Reference no.: [__________] │
│                            │  Amount (₱):    [__________] │
│                            │  Date:          [__________] │
│                            │  [Read my receipt]           │
│                            │  ☐ I checked these values    │
│                            │  [Submit payment]            │
└───────────────────────────┴──────────────────────────────┘
On phones: image on top, fields below.
```

- Fields that OCR filled get a small label "Read from image — please check".
- Fields with low confidence get a yellow border and "Not sure — please check".
- Reference and amount use `inputmode="numeric"` / `decimal` so the phone shows a number keyboard.
- Saved `entry_method`: `ocr` (no edits), `ocr_edited` (client changed at least one OCR field), `manual` (no OCR used).

---

## 7. Server checks (`savePayment` Server Action)

1. `requireRequestAccess(requestId, "pay")` — status must allow payment.
2. Rate limit: 5 payment submits per hour per request.
3. Zod:
   - `paymentMethodId`: uuid of an **active** method.
   - `reference`: normalized again on the server; 6–30 characters; must match the parser's `referencePattern` if one is set (else only letters/digits).
   - `amountCentavos`: integer, 1 to 10,000,000 (₱100,000; limit editable later).
   - `paidOn`: valid date, not in the future (Asia/Manila), not older than 60 days.
   - `confirmed`: must be `true`.
   - `ocrRawValues`: optional, short strings only.
4. Insert. If the unique index `(payment_method_id, reference_number)` fails → friendly error: "This reference number was already used. Please check it."
5. Save `method_snapshot`.
6. Change request status to `payment_submitted` (if allowed), log, email admin.

---

## 8. Admin screen

On each payment card:
> ⚠️ **Check this payment in your own [GCash/Maya/BDO] app before you verify.**
> These values came from the client (typed or read by OCR from their screenshot). They can be wrong or fake.

Shows: method snapshot, reference, amount, date, entry method, and (if edited) what OCR first read vs. final values.

---

## 9. Test plan

### Unit tests (Vitest) — required
- **Parsers:** for each parser, fixture files in `tests/fixtures/receipts/{app}/*.json` (OCR result objects, text only). Expected output in the same file. Cases:
  - clean receipt
  - common OCR mistakes (O/0, S/5, l/1, comma vs dot)
  - amount with ₱ sign, with "PHP", with commas, with no decimals
  - different date formats (Nov 6, 2026 / 11/06/2026 / 2026-11-06 / 06 Nov 2026)
  - missing field → `null`, not a crash
  - wrong app's receipt → low `matches` score
- **Shared helpers:** `parseAmount`, `parseDate`, `fixDigitLookalikes`, `normalizeReference`.
- **Server validation:** Zod schema accepts good values and rejects each bad case in section 7.
- **Duplicate reference:** integration test against a test database.

### Collecting real samples (later)
- Ask the owner for 3–5 real receipts per app (her own or with client permission).
- Run them through OCR **on our own machine**, save only the **text result** (JSON) as fixtures.
- **Blur or replace** real names, numbers, and amounts in the fixture text before committing. Never commit real receipt images.
- Measure: % of fields correct with no edits. Goal for v1: amount ≥ 90%, reference ≥ 80%, date ≥ 80% on clear screenshots.

### Manual tests
- Old Android phone on slow data: time to load OCR and read one receipt.
- iPhone Safari.
- Airplane mode after OCR is loaded (should still work from cache).

---

## 10. Edge cases

| Case | What happens |
|---|---|
| Photo of a screen instead of a screenshot | Lower accuracy. Show the "please check" labels. Manual still works. |
| Receipt in dark mode | Image prep inverts colors if the image is mostly dark. |
| Cropped receipt (missing amount) | Field empty, client types it. |
| Two amounts on receipt (amount + fee + total) | Parser prefers "Total" / "Amount" label rules per app; client checks. |
| Client picks wrong payment method | Low `matches` score warning. |
| Reference already used | Server error message, client can fix a typo. Admin sees nothing new. |
| Real duplicate (client submits twice) | Same unique-index error. Client sees "already submitted". |
| OCR loading fails (no data) | Message + manual form. |
| Very old phone / no WebAssembly | OCR button hidden. |
| Client closes page during OCR | Worker stops. Nothing was saved. |
| Amount typed with comma as decimal ("1.250,00") | `parseAmount` handles both styles; client checks. |
| Receipt for a different date than today | Allowed within 60 days. |
| New payment app added by admin without a parser | Manual only. |


---

## 11. Measured in Phase 4 (2026-11-06)

Measured by the Playwright test `tests/e2e/payment.spec.ts` ("reading a receipt in the browser"), in Google Chrome on the developer's Windows computer with a fast home connection and a fresh browser profile (nothing cached).

| What | Result |
|---|---|
| Download the first time (Tesseract.js 7 core, worker and English "fast" data, from the jsDelivr CDN) | **about 4.2 MB** (4,402,582 bytes in 5 files) |
| Time to read one receipt, including the download | **about 3 seconds** on this computer |
| Test picture | A **synthetic** receipt drawn by the test (clean black text on white, plain Arial). It is NOT a real GCash, Maya or BDO receipt. |
| Result | Reference number, amount and date were all read correctly. |

What this does **not** tell us:

- Accuracy on real receipts. Real formats are unknown, so the parser label patterns are placeholders. The accuracy goals in section 9 still need real samples.
- Speed on an old Android phone or a slow connection. Please test by hand (section 9, "Manual tests"). On slow data the 4.2 MB download will dominate.
- The second time, the browser keeps the files, so only the reading time remains.

The client screen says "about 4 MB" before the download. Change the text if the measurement changes.
