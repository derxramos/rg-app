// Sample payment methods for the seed. EVERYTHING here is fake and clearly marked "SAMPLE - not real".
// They start OFF (is_active false), so they never show to clients by accident.
// The owner replaces the account details and the QR image in the admin area, then turns them on.
// Local testing only: set SEED_ACTIVATE_SAMPLE_PAYMENTS=1 to turn them on.
export const SAMPLE_PAYMENT_METHODS = [
  { name: "GCash", parserKey: "gcash" },
  { name: "Maya", parserKey: "maya" },
  { name: "BDO", parserKey: "bdo" },
] as const;

export const SAMPLE_ACCOUNT = {
  accountName: "SAMPLE - not real",
  accountNumber: "0000 000 0000",
  instructions:
    "SAMPLE - not real. The owner replaces this text, the account details and the QR image.",
  // A fake QR picture that says "SAMPLE QR - NOT REAL". It ships in public/samples.
  qrImagePath: "samples/sample-qr.svg",
} as const;
