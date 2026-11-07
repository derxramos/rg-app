// Structured data for search engines (schema.org, JSON-LD). It is a data block, not code, so it does
// not run and the page security rules (CSP) do not block it. It is not visible on the page.
// "<" is escaped so text from the database can never close the script tag early.
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, "\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
