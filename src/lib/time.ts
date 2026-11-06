// Time helpers. Times are stored in UTC and always shown in Asia/Manila time.

const MANILA = "Asia/Manila";

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export type TimeInput = Date | string | number;

function toDate(input: TimeInput): Date {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date.");
  }
  return date;
}

// "2026-11-06T01:37:00Z" -> "Nov 6, 2026"
export function formatManilaDate(input: TimeInput): string {
  return dateFormatter.format(toDate(input));
}

// "2026-11-06T01:37:00Z" -> "Nov 6, 2026, 9:37 AM"
export function formatManilaDateTime(input: TimeInput): string {
  // Some systems write "am"/"pm" in lower case. We always show upper case.
  return dateTimeFormatter.format(toDate(input)).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}
