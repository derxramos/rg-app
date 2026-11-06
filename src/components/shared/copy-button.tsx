"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

// A Copy button with a "Copied" state. A polite live region tells screen readers the result.
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 3000);
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={copy}>
        {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {state === "copied" ? "Copied" : label}
      </Button>
      <span role="status" className="min-h-4 text-xs text-muted-foreground">
        {state === "copied" ? "Copied to your clipboard." : null}
        {state === "failed" ? "Could not copy. Please select and copy it." : null}
      </span>
    </span>
  );
}
