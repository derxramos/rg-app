// Links shown in the public header and footer.
// The pages behind most of these links are built in Phase 2.
export const MAIN_NAV = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/contact", label: "Contact" },
  { href: "/track", label: "Track my request" },
] as const;

// "Pages" column of the footer.
export const FOOTER_NAV = MAIN_NAV.filter((item) => item.href !== "/");

// Thin bottom row of the footer, next to the copyright text.
export const LEGAL_NAV = [
  { href: "/privacy", label: "Privacy notice" },
  { href: "/terms", label: "Terms of service" },
] as const;

export const BUSINESS_NAME = "RG'S BOOKKEEPING AND ACCOUNTING SERVICES";
