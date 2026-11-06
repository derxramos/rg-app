"use client";

// Small interactive demos for /dev/ui. Development only.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { notify } from "@/components/ui/sonner";

export function ThemeSwitch() {
  const [theme, setTheme] = useState<"light" | "alt">("light");

  function choose(next: "light" | "alt") {
    setTheme(next);
    if (next === "alt") {
      document.documentElement.setAttribute("data-theme", "alt");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant={theme === "light" ? "default" : "outline"}
        aria-pressed={theme === "light"}
        onClick={() => choose("light")}
      >
        Teal Ledger (default)
      </Button>
      <Button
        size="sm"
        variant={theme === "alt" ? "default" : "outline"}
        aria-pressed={theme === "alt"}
        onClick={() => choose("alt")}
      >
        Harbor Navy (alt)
      </Button>
    </div>
  );
}

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() => notify.success("Saved. Your changes are live.")}
      >
        Success toast
      </Button>
      <Button size="sm" variant="outline" onClick={() => notify.info("Your code was copied.")}>
        Info toast
      </Button>
      <Button size="sm" variant="outline" onClick={() => notify.warning("Storage is almost full.")}>
        Warning toast
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => notify.error("We could not save this. Please try again.")}
      >
        Error toast (8 s)
      </Button>
    </div>
  );
}

export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false);

  function run() {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  }

  return (
    <Button loading={loading} onClick={run}>
      {loading ? "Saving..." : "Click to see loading"}
    </Button>
  );
}

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>
            This sample dialog shows the title, text and two buttons. Press Tab: the focus stays
            inside the dialog. Press Escape to close it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep request</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive">Yes, cancel it</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
