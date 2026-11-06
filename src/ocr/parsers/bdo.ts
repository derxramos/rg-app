import { createParser } from "./factory";

// BDO receipt parser. PLACEHOLDER label patterns: real receipts are not collected yet.
export const bdoParser = createParser({
  key: "bdo",
  displayName: "BDO",
  brandWords: /\bbdo\b|banco\s+de\s+oro/i,
  referenceLabel: /(?:transaction\s+)?ref(?:erence)?\.?\s*(?:no|number|num)\.?/i,
  amountLabel: /amount|total/i,
  referenceCharList: "0123456789",
  referencePattern: null,
});
