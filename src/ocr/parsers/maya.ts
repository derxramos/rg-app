import { createParser } from "./factory";

// Maya receipt parser. PLACEHOLDER label patterns: real receipts are not collected yet.
export const mayaParser = createParser({
  key: "maya",
  displayName: "Maya",
  brandWords: /\bmaya\b|paymaya/i,
  referenceLabel: /ref(?:erence)?\.?\s*(?:id|no|number)\.?/i,
  amountLabel: /amount/i,
  // Maya may use letters in reference numbers. Capital letters and digits are allowed.
  referenceCharList: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  referencePattern: null,
});
