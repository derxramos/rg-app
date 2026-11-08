"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";

// The inside of a filter form (use it as the only child of a <form>).
// Phones (below 1180 px): the search box, a search button and a "Filters" button. The other fields open
// in a panel under them, so the list starts high on the screen.
// Large screens: the toggle buttons are gone and every field is in the form's grid, as before.
// It is a plain GET form either way, so the filters end up in the web address.
export function FilterPanel({
  search,
  activeCount = 0,
  children,
}: {
  search?: React.ReactNode;
  activeCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <div className="flex items-end gap-2 min-[1180px]:contents">
        {search ? (
          <>
            <div className="min-w-0 flex-1">{search}</div>
            <Button type="submit" variant="outline" size="icon" className="min-[1180px]:hidden">
              <Search aria-hidden="true" />
              <span className="sr-only">Search</span>
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className={`min-[1180px]:hidden ${search ? "" : "flex-1"}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters{activeCount ? ` (${activeCount})` : ""}
        </Button>
      </div>
      <div
        id={panelId}
        className={`${open ? "flex" : "hidden"} flex-col gap-3 min-[1180px]:contents`}
      >
        {children}
      </div>
    </>
  );
}
