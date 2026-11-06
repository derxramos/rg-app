// CSV export with protection against "formula injection" (docs/FEATURES.md A11).
// A cell that starts with = + - @ (or a tab or carriage return) can run as a formula in Excel or
// Google Sheets. We put an apostrophe in front, so it is shown as plain text.

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  // The first character is a byte order mark, so Excel reads the peso sign and accents correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
