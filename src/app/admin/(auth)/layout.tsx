import type { Metadata } from "next";

import { Logo } from "@/components/shared/logo";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

// Login and 2FA screens: a small centered card, no public header or footer.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-surface-subtle px-5 py-10"
    >
      <Logo />
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm md:p-8">
        {children}
      </div>
    </main>
  );
}
