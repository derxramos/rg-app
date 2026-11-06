import { createParser } from "./factory";

// GCash receipt parser. PLACEHOLDER label patterns: real receipts are not collected yet.
export const gcashParser = createParser({
  key: "gcash",
  displayName: "GCash",
  brandWords: /g\s?cash/i,
  referenceLabel: /ref(?:erence)?\.?\s*(?:no|number|num)\.?/i,
  amountLabel: /amount(?:\s+sent)?|total\s+amount/i,
  referenceCharList: "0123456789",
  referencePattern: null,
});
