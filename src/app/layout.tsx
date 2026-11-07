import type { Metadata, Viewport } from "next";

import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME } from "@/lib/seo";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { getBaseUrl } from "@/lib/site-url";
import { Toaster } from "@/components/ui/sonner";

import { plusJakarta } from "./fonts";
import "./globals.css";

// Browser bar color on phones. Same as the brand primary color.
export const viewport: Viewport = {
  // The browser bar color on phones follows the device setting (day: brand teal, night: the dark page color).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b6158" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a18" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  // Makes the Open Graph image and the canonical links absolute web addresses.
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "business",
  // A phone number in the text should not turn into a link by itself.
  formatDetection: { telephone: false, email: false, address: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    locale: "en_PH",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
  // Optional. Set these in the environment to prove you own the site to Google and Bing.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets day or night before the first paint, so the page never flashes. Same text on every page. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
