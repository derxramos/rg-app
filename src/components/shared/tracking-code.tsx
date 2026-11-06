"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

// Big monospace code with a Copy button. The code uses the system monospace font (no download).
export function TrackingCode({ code, className }: { code: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      // Some phones block the clipboard. The client can still select the code by hand.
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 3000);
  }

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border bg-primary-soft p-5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm text-primary-ink">Your tracking code</p>
        <p className="font-mono text-2xl font-bold tracking-wider break-all text-primary-ink md:text-3xl">
          {code}
        </p>
      </div>
      <div className="flex flex-col items-start gap-1">
        <Button variant="outline" onClick={copy} className="bg-background">
          {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {state === "copied" ? "Copied" : "Copy code"}
        </Button>
        {/* A polite live region: screen readers announce the result of the copy. */}
        <span role="status" className="min-h-5 text-sm text-primary-ink">
          {state === "copied" ? "Code copied to your clipboard." : null}
          {state === "failed" ? "Could not copy. Please select the code and copy it." : null}
        </span>
      </div>
    </div>
  );
}
