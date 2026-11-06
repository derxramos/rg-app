"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/shared/page-container";
import { MAIN_NAV } from "@/components/shared/site-nav";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, focusRing } from "@/lib/utils";

function navLinkClass(active: boolean) {
  return cn(
    "flex min-h-11 items-center rounded-md px-3 text-base",
    active ? "bg-primary-soft font-bold text-primary-ink" : "text-foreground hover:bg-accent",
    focusRing,
  );
}

// Public header: 64 px tall. Full menu from 1024 px. A Menu button below that.
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Escape closes the menu and puts the focus back on the Menu button.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:font-bold focus:shadow-md",
          focusRing,
        )}
      >
        Skip to main content
      </a>
      <PageContainer className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="RG'S Bookkeeping and Accounting, home"
          className={cn("rounded-md", focusRing)}
        >
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={navLinkClass(pathname === item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/request"
            className={cn(
              buttonVariants({ variant: "accent", size: "sm" }),
              "hidden sm:inline-flex",
            )}
          >
            Start a request
          </Link>
          <Button
            ref={menuButton}
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </PageContainer>

      {open ? (
        <nav id="mobile-menu" aria-label="Main" className="border-t bg-background lg:hidden">
          <PageContainer className="flex flex-col gap-1 py-3">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={navLinkClass(pathname === item.href)}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/request"
              onClick={() => setOpen(false)}
              className={cn(buttonVariants({ variant: "accent" }), "mt-2 sm:hidden")}
            >
              Start a request
            </Link>
          </PageContainer>
        </nav>
      ) : null}
    </header>
  );
}
