import { bdoParser } from "./bdo";
import { gcashParser } from "./gcash";
import { mayaParser } from "./maya";
import type { ReceiptParser } from "./types";

// Adding an app = write a file, add it to this list, add fixtures and tests.
export const PARSERS: readonly ReceiptParser[] = [gcashParser, mayaParser, bdoParser];

// payment_methods.parser_key links a payment method to a parser. Null or unknown means manual only.
export function getParser(key: string | null | undefined): ReceiptParser | null {
  return PARSERS.find((parser) => parser.key === key) ?? null;
}
