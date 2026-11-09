// The Privacy notice and the Terms of service. No database or browser code here, so the server, the pages and
// the tests can all use it.
//
// The owner edits the text in the admin area. Two words in double curly braces stay in the saved text and are
// filled in when a visitor reads the page, so a change to the contact details or the file retention days
// shows up at once without a new version:
//   {{retention_days}}  the number of days files are kept (File settings)
//   {{contact_lines}}   the contact list (Site content)

export const LEGAL_KINDS = ["privacy", "terms"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const LEGAL_LABELS: Record<LegalKind, string> = {
  privacy: "Privacy notice",
  terms: "Terms of service",
};

export const LEGAL_BODY_MIN = 200;
export const LEGAL_BODY_MAX = 60000;

export type LegalFacts = { retentionDays: number; contactEmail: string; contactPhone: string };

export function isLegalKind(value: unknown): value is LegalKind {
  return typeof value === "string" && (LEGAL_KINDS as readonly string[]).includes(value);
}

// The contact bullets. The privacy notice and the terms use their own words, as before.
function contactLines(kind: LegalKind, { contactEmail, contactPhone }: LegalFacts): string {
  const lines = [
    contactEmail ? `- Email: ${contactEmail}` : null,
    contactPhone ? `- ${kind === "terms" ? "Phone, Viber" : "Phone"}: ${contactPhone}` : null,
  ].filter(Boolean);
  if (lines.length > 0) return lines.join("\n");
  return kind === "terms"
    ? "- Please use the Contact page on this website."
    : "- [Contact person and contact details to be added by the owner]";
}

// Fills in the two words. Every other text stays as the owner wrote it.
export function fillLegalText(kind: LegalKind, template: string, facts: LegalFacts): string {
  return template
    .replaceAll("{{retention_days}}", String(facts.retentionDays))
    .replaceAll("{{contact_lines}}", contactLines(kind, facts));
}

// A version is the day (Manila time) and a counter: 2026-11-09.1, 2026-11-09.2, and so on. The built-in text
// that ships with the app is "<its date>.0". The counter keeps two saves on one day apart.
export function nextLegalVersion(today: string, existing: readonly string[]): string {
  const prefix = `${today}.`;
  const used = existing
    .filter((version) => version.startsWith(prefix))
    .map((version) => Number(version.slice(prefix.length)))
    .filter((n) => Number.isInteger(n) && n >= 0);
  return `${prefix}${used.length > 0 ? Math.max(...used) + 1 : 1}`;
}

export function builtInLegalVersion(date: string): string {
  return `${date}.0`;
}

// Text in [square brackets] that is not a link is a part the owner has not filled in yet.
export function hasMissingParts(text: string): boolean {
  return /\[[^\]\n]+\](?!\()/.test(text);
}

// Line endings from a phone or a browser vary. Save one kind, and no spaces at the end of the text.
export function cleanLegalBody(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function checkLegalBody(text: string): string | null {
  if (text.length < LEGAL_BODY_MIN)
    return `The text is too short (at least ${LEGAL_BODY_MIN} characters).`;
  if (text.length > LEGAL_BODY_MAX)
    return `The text is too long (at most ${LEGAL_BODY_MAX} characters).`;
  return null;
}
