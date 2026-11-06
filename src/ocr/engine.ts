// Browser-only receipt reading with Tesseract.js (docs/OCR_PAYMENTS.md sections 2 to 4).
// The receipt image NEVER leaves the phone: it is drawn on a canvas, read, and forgotten.
// Tesseract.js is loaded only when the client taps "Read my receipt" (dynamic import).

import { mergePasses, type MergedFields } from "./merge";
import type { Box, OcrPage, ReceiptParser } from "./parsers/types";

export const OCR_TIME_LIMIT_MS = 30_000;
const MAX_WIDTH = 1400; // about 1000 to 1500 px wide is a good balance of speed and accuracy

export type OcrProgress = { status: string; progress: number };

export type OcrOutcome = {
  fields: MergedFields;
  // How much the text looks like the chosen app's receipt (0 to 1).
  matchScore: number;
};

export function ocrSupported(): boolean {
  return typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
}

// Fixes the rotation (EXIF), shrinks big screenshots, makes grey, and raises the contrast.
export async function prepareImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No canvas");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const grey = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = grey;
    sum += grey;
  }
  const mean = sum / (data.length / 4);
  // A dark mode receipt (light text on a dark background) is turned around, so the text is dark.
  const invert = mean < 110;
  for (let i = 0; i < data.length; i += 4) {
    let value = invert ? 255 - data[i] : data[i];
    value = Math.max(0, Math.min(255, (value - 128) * 1.3 + 128)); // more contrast
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

// Turns the Tesseract result into the simple OcrPage the parsers understand.
type TessBox = { x0: number; y0: number; x1: number; y1: number };
type TessWord = { text: string; confidence: number; bbox: TessBox };
type TessLine = { text: string; bbox: TessBox; words: TessWord[] };
type TessData = {
  text: string;
  blocks?: { paragraphs: { lines: TessLine[] }[] }[] | null;
};

export function toOcrPage(data: TessData): OcrPage {
  const lines = (data.blocks ?? []).flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.map((line) => ({
        text: line.text.replace(/\s+/g, " ").trim(),
        bbox: line.bbox,
        words: line.words.map((word) => ({
          text: word.text,
          confidence: word.confidence / 100,
          bbox: word.bbox,
        })),
      })),
    ),
  );
  return {
    text: data.text ?? lines.map((l) => l.text).join("\n"),
    lines: lines.filter((l) => l.text),
  };
}

function clampRegion(region: Box, width: number, height: number) {
  const left = Math.max(0, Math.round(region.x0));
  const top = Math.max(0, Math.round(region.y0));
  const right = Math.min(width, Math.round(region.x1));
  const bottom = Math.min(height, Math.round(region.y1));
  return right - left > 4 && bottom - top > 4
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OCR_TIMEOUT")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Reads the receipt in two passes. Throws "OCR_TIMEOUT" after 30 seconds. Always closes the worker.
export async function readReceipt(
  file: File,
  parser: ReceiptParser,
  onProgress?: (progress: OcrProgress) => void,
  timeLimitMs: number = OCR_TIME_LIMIT_MS,
): Promise<OcrOutcome> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (message: { status: string; progress: number }) =>
      onProgress?.({ status: message.status, progress: message.progress }),
  });

  try {
    return await withTimeout(
      (async () => {
        const canvas = await prepareImage(file);

        // Pass 1: all the text, with positions.
        const first = await worker.recognize(canvas, {}, { blocks: true });
        const page = toOcrPage(first.data as unknown as TessData);
        const guesses = parser.findFields(page);

        // Pass 2: only the areas next to the labels, digits only. (A whitelist on the whole receipt
        // would turn the labels into digits, so we use pass 1 to find WHERE the numbers are.)
        const pass2: { reference?: string; amount?: string } = {};
        const readRegion = async (region: Box | null, chars: string) => {
          if (!region) return undefined;
          const rectangle = clampRegion(region, canvas.width, canvas.height);
          if (!rectangle) return undefined;
          await worker.setParameters({ tessedit_char_whitelist: chars });
          const result = await worker.recognize(canvas, { rectangle });
          return result.data.text.trim();
        };
        pass2.amount = await readRegion(guesses.amount.region, "0123456789.,");
        pass2.reference = await readRegion(guesses.reference.region, parser.referenceCharList);
        await worker.setParameters({ tessedit_char_whitelist: "" });

        return {
          fields: mergePasses(parser, guesses, pass2),
          matchScore: parser.matches(page),
        };
      })(),
      timeLimitMs,
    );
  } finally {
    await worker.terminate().catch(() => {});
  }
}
