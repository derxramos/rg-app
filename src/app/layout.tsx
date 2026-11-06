import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";

import { plusJakarta } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RG'S Bookkeeping and Accounting Services",
    template: "%s | RG'S Bookkeeping and Accounting Services",
  },
  description:
    "Send your request and documents online, pay in your own GCash, Maya or bank app, and track your request with a code.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
