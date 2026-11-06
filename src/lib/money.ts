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
