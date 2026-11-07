// Money helpers. Money is stored as whole centavos (₱150.50 is 15050). Never use floats for money.

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

// 125000 -> "₱1,250.00"
export function formatPesos(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    // A fraction of a centavo means a bug somewhere else. Fail loudly instead of showing a wrong amount.
    throw new RangeError("Money must be a whole number of centavos.");
  }
  // Dividing by 100 is safe here: the formatter rounds to 2 decimals, and centavos is a whole number.
  return pesoFormatter.format(centavos / 100);
}

// "5000", "5,000" or "1250.50" -> centavos. Empty text -> null (no fee set yet).
// Anything else (letters, a minus sign, 3 decimals, more than 100 million pesos) -> NaN, so the caller can show an error.
export function parsePesosToCentavos(input: string): number | null {
  const text = input.trim().replace(/^₱\s*/, "").replace(/,/g, "");
  if (text === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN;
  const [whole, fraction = ""] = text.split(".");
  const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return centavos > 10_000_000_000 ? Number.NaN : centavos;
}

// 500000 -> "5000" (for an input box). null -> "".
export function centavosToPesoInput(centavos: number | null): string {
  if (centavos === null) return "";
  const whole = Math.floor(centavos / 100);
  const fraction = centavos % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}

// For service fees: 500000 -> "₱5,000" (no ".00" on whole pesos), 125050 -> "₱1,250.50".
export function formatFee(centavos: number): string {
  return centavos % 100 === 0 ? formatPesos(centavos).replace(/\.00$/, "") : formatPesos(centavos);
}
