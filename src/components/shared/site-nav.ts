// Links shown in the public header. (The footer has only the legal links below.)
// The pages behind most of these links are built in Phase 2.
export const MAIN_NAV = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/contact", label: "Contact" },
  { href: "/track", label: "Track my request" },
] as const;

// The two links on the right of the footer, next to the logo.
export const LEGAL_NAV = [
  { href: "/privacy", label: "Privacy notice" },
  { href: "/terms", label: "Terms of service" },
] as const;

export const BUSINESS_NAME = "RG'S BOOKKEEPING AND ACCOUNTING SERVICES";
