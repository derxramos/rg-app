// Shared values and helpers for search engine optimization (SEO). Pure functions: easy to test.

export const SITE_NAME = "RG'S Bookkeeping and Accounting Services";
export const SITE_DESCRIPTION =
  "Bookkeeping and accounting services in Batangas City, Philippines. Send your request and documents online, pay in your own GCash, Maya or bank app, and track your request with a code.";
export const SITE_KEYWORDS = [
  "bookkeeping",
  "accounting services",
  "Batangas City",
  "Philippines",
  "business permit",
  "online request",
  "track my request",
];

// Search engines show about 155 characters of a description. Cut at a word, add "...".
export function trimDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 3);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}...`;
}

type Crumb = { name: string; path: string };

// A "breadcrumb" shows the page path in search results: Home > Services > Business Permit.
export function breadcrumbJsonLd(base: string, crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${base}${crumb.path}`,
    })),
  };
}

// The business, for the home page. Only fields that exist are included: nothing is invented.
export function businessJsonLd(
  base: string,
  info: { phone: string; email: string; address: string; sameAs: string[] },
) {
  return {
    "@context": "https://schema.org",
    "@type": "AccountingService",
    "@id": `${base}/#business`,
    name: SITE_NAME,
    url: base,
    description: SITE_DESCRIPTION,
    image: `${base}/opengraph-image`,
    areaServed: { "@type": "Country", name: "Philippines" },
    ...(info.phone ? { telephone: info.phone } : {}),
    ...(info.email ? { email: info.email } : {}),
    ...(info.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: info.address,
            addressCountry: "PH",
          },
        }
      : {}),
    ...(info.sameAs.length > 0 ? { sameAs: info.sameAs } : {}),
  };
}

export function websiteJsonLd(base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: base,
    name: SITE_NAME,
    inLanguage: "en-PH",
  };
}

// One service with its price (only when the owner set a fee). feeCentavos 500000 -> price "5000.00".
export function serviceJsonLd(
  base: string,
  service: { slug: string; name: string; description: string; feeCentavos: number | null },
) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: service.description,
    url: `${base}/services/${service.slug}`,
    provider: { "@id": `${base}/#business` },
    areaServed: { "@type": "Country", name: "Philippines" },
    ...(service.feeCentavos !== null
      ? {
          offers: {
            "@type": "Offer",
            price: (service.feeCentavos / 100).toFixed(2),
            priceCurrency: "PHP",
            url: `${base}/services/${service.slug}`,
          },
        }
      : {}),
  };
}
