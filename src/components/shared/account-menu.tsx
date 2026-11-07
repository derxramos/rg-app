"use client";

import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { cn, focusRing } from "@/lib/utils";

type Props = {
  // The first name, or "Account" when we have no name. Long names are cut with "...".
  name: string;
  // One letter for the small circle.
  initial: string;
  // "My requests" for a user, "Admin" for an admin.
  linkHref: string;
  linkLabel: string;
};

const itemClass = cn(
  "flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent",
  focusRing,
);

// One button for a signed in person: a small initial circle, the first name and an arrow. It opens a small menu
// with the link to their area and "Sign out". Keyboard: Enter, Space or Arrow Down opens it. Arrow keys, Home and
// End move between items. Escape closes it and gives the focus back to the button. A click outside, or Tab, closes it.
// Sign out is a plain form POST (never a link), so another website cannot sign someone out.
export function AccountMenu({ name, initial, linkHref, linkLabel }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // Focus the first item when the menu opens with the keyboard.
  const focusOnOpen = useRef<"first" | "last" | null>(null);
  useEffect(() => {
    if (!open) return;
    const all = items();
    if (focusOnOpen.current === "first") all[0]?.focus();
    if (focusOnOpen.current === "last") all[all.length - 1]?.focus();
    focusOnOpen.current = null;
  }, [open]);

  // Click outside closes. Escape closes and returns the focus.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOnOpen.current = event.key === "ArrowDown" ? "first" : "last";
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    let target: HTMLElement | undefined;
    if (event.key === "ArrowDown") target = all[(index + 1) % all.length];
    else if (event.key === "ArrowUp") target = all[(index - 1 + all.length) % all.length];
    else if (event.key === "Home") target = all[0];
    else if (event.key === "End") target = all[all.length - 1];
    else if (event.key === "Tab") {
      // Close, and put the focus on the button: the browser then moves on to the next control after it.
      setOpen(false);
      button.current?.focus();
    }
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu, ${name}`}
        title={name}
        onClick={(event) => {
          // detail is 0 when Enter or Space made the click: then the first item gets the focus.
          focusOnOpen.current = event.detail === 0 ? "first" : null;
          setOpen((value) => !value);
        }}
        onKeyDown={onButtonKeyDown}
        className={cn(
          "inline-flex min-h-11 max-w-44 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent md:min-h-10",
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
        >
          {initial}
        </span>
        <span className="min-w-0 truncate">{name}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          ref={list}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-50 mt-2 flex w-56 flex-col gap-1 rounded-lg border bg-popover p-2 shadow-md"
        >
          <Link
            role="menuitem"
            href={linkHref}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {linkLabel}
          </Link>
          <form method="post" action="/auth/sign-out" role="none">
            <button type="submit" role="menuitem" className={itemClass}>
              <LogOut aria-hidden="true" className="size-4 shrink-0" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
