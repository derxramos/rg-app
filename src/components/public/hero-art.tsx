import { Check } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";

// Decoration for the home page. Made only from CSS shapes and simple UI cards: no photos, no
// download. It shows no real data, so screen readers skip it (aria-hidden).
export function HeroArt() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-72 w-full max-w-md md:h-80">
      <span className="absolute top-2 right-6 size-40 rounded-full bg-brand-accent-soft md:size-48" />
      <span className="absolute bottom-0 left-2 size-24 rounded-full bg-primary-soft" />
      <span className="absolute top-0 left-12 size-6 rounded-full bg-highlight" />
      <span className="absolute right-0 bottom-10 h-3 w-24 rounded-full bg-brand-accent" />

      <div className="absolute top-8 left-0 flex w-60 flex-col gap-3 rounded-lg border bg-card p-4 shadow-md md:w-64">
        <StatusBadge status="in_progress" />
        <span className="h-3 w-3/4 rounded-full bg-muted" />
        <span className="h-3 w-1/2 rounded-full bg-muted" />
      </div>

      <div className="absolute right-0 bottom-6 flex w-56 items-center gap-3 rounded-lg border bg-card p-4 shadow-md md:w-60">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-ink">
          <Check className="size-5" strokeWidth={3} />
        </span>
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-3 w-full rounded-full bg-muted" />
          <span className="h-3 w-2/3 rounded-full bg-muted" />
        </span>
      </div>
    </div>
  );
}
