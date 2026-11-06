"use client";

import "./globals.css";

import { plusJakarta } from "./fonts";

// The last safety net: it replaces the whole page when even the root layout fails.
// It must be plain, so it uses no database, no shared components and no context.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col items-start gap-4 p-8 font-sans">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          We are sorry. The website could not load. Please try again in a few minutes.
        </p>
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-md bg-primary px-5 py-2 text-base font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
