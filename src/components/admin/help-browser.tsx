"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { HelpGroup, HelpItem } from "@/lib/help-content";
import { cn, focusRing } from "@/lib/utils";

const ALL = "all";

function HelpEntry({ item }: { item: HelpItem }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="flex flex-wrap items-center gap-2 text-lg font-bold">
        {item.status ? <StatusBadge status={item.status} /> : item.name}
      </h4>
      <p className="text-lg">
        <span className="font-bold">What it is: </span>
        {item.what}
      </p>
      {item.todo ? (
        <p className="text-lg">
          <span className="font-bold">What to do: </span>
          {item.todo}
        </p>
      ) : null}
      <p className="text-lg text-muted-foreground">
        <span className="font-bold">Example: </span>
        {item.example}
      </p>
    </div>
  );
}

// The help groups are in the same order as the left menu. Each group is a big header that opens and closes.
// A drop-down at the top shows just one group. We use the browser's own <select> and <details>, because they
// work with the keyboard and with screen readers without extra code.
export function HelpBrowser({
  groups,
  initialTopic,
}: {
  groups: HelpGroup[];
  initialTopic: string | null;
}) {
  const start = groups.some((g) => g.id === initialTopic) ? (initialTopic as string) : ALL;
  const [topic, setTopic] = useState(start);
  // The groups that are open. A group chosen with F1 or the drop-down starts open.
  const [open, setOpen] = useState<Set<string>>(new Set(start === ALL ? [] : [start]));

  const shown = topic === ALL ? groups : groups.filter((g) => g.id === topic);

  function choose(value: string) {
    setTopic(value);
    setOpen(new Set(value === ALL ? [] : [value]));
  }

  function toggle(id: string, isOpen: boolean) {
    setOpen((current) => {
      const next = new Set(current);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allOpen = shown.every((g) => open.has(g.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="help-topic" className="text-lg font-bold">
            Show help for
          </label>
          <select
            id="help-topic"
            value={topic}
            onChange={(e) => choose(e.target.value)}
            className={cn(
              "min-h-12 min-w-60 rounded-md border bg-background px-3 text-lg",
              focusRing,
            )}
          >
            <option value={ALL}>All screens</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((g) => g.id)))}
        >
          {allOpen ? "Close all" : "Open all"}
        </Button>
      </div>

      {shown.map((group) => (
        <details
          key={group.id}
          id={group.id}
          open={open.has(group.id)}
          onToggle={(e) => toggle(group.id, e.currentTarget.open)}
          className="group scroll-mt-20 rounded-lg border bg-card"
        >
          <summary
            className={cn(
              "flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 text-xl font-bold text-primary-ink [&::-webkit-details-marker]:hidden",
              focusRing,
            )}
          >
            {group.title}
            <ChevronDown
              aria-hidden="true"
              className="size-6 shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="flex flex-col gap-6 border-t p-4">
            {group.sections.map((section, index) => (
              <section key={section.title ?? index} className="flex flex-col gap-5">
                {section.title ? (
                  <h3 className="text-xl font-bold text-primary-ink">{section.title}</h3>
                ) : null}
                {section.items.map((item) => (
                  <HelpEntry key={item.name} item={item} />
                ))}
              </section>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
