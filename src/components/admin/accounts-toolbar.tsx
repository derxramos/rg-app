"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { ROLES, ROLE_LABELS } from "@/lib/permissions";
import {
  ACCOUNT_STATUSES,
  PAGE_SIZES,
  STATUS_LABELS,
  type AccountQuery,
} from "@/lib/validation/accounts";

// Same width rule as the list (data-views.tsx): below 1180 px the list shows cards.
const NARROW = "(max-width: 1179px)";
const isNarrow = () => window.matchMedia(NARROW).matches;

// Search, filters and rows per page. It is a normal GET form, so everything ends up in the web address
// (?q=&role=&status=&per=) and the server does the work. Page 1 is shown again after every change.
// Wide screens: all fields in one row, and a change in a list sends the form at once.
// Phones: the search box and a "Filters" button. The button opens Role and Status with an Apply button.
// "Rows per page" is not shown on a phone, and a phone always asks for 10 rows, so the list stays short.
export function AccountsToolbar({ query }: { query: AccountQuery }) {
  const form = useRef<HTMLFormElement>(null);
  const per = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // First visit on a phone: ask for 10 rows once (the server default is 25).
  useEffect(() => {
    if (isNarrow() && !params.has("per")) {
      const next = new URLSearchParams(params);
      next.set("per", "10");
      router.replace(`${pathname}?${next.toString()}`);
    }
  }, [params, pathname, router]);

  const send = () => {
    if (!isNarrow()) form.current?.requestSubmit();
  };
  const beforeSend = () => {
    if (isNarrow() && per.current) per.current.value = "10";
  };
  const activeFilters = (query.role ? 1 : 0) + (query.status ? 1 : 0);

  return (
    <form
      ref={form}
      method="get"
      role="search"
      aria-label="Search and filter accounts"
      onSubmit={beforeSend}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 min-[1180px]:grid min-[1180px]:grid-cols-[2fr_1fr_1fr_auto_auto]"
    >
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="acc-q">
            Search<span className="hidden min-[1180px]:inline"> by name or email</span>
          </Label>
          <Input
            id="acc-q"
            name="q"
            type="search"
            defaultValue={query.q}
            maxLength={100}
            placeholder="Name or email"
          />
        </div>
        {/* Phone only: search with the button (the Enter key works too), and open the filters. */}
        <Button type="submit" variant="outline" size="icon" className="min-[1180px]:hidden">
          <Search aria-hidden="true" />
          <span className="sr-only">Search</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-[1180px]:hidden"
          aria-expanded={open}
          aria-controls="acc-filters"
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </Button>
      </div>
      {/* On a phone this panel opens with the Filters button. From 1180 px it is always part of the row. */}
      <div
        id="acc-filters"
        className={`${open ? "flex" : "hidden"} flex-col gap-3 min-[1180px]:contents`}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="acc-role">Role</Label>
          <NativeSelect id="acc-role" name="role" defaultValue={query.role ?? ""} onChange={send}>
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="acc-status">Status</Label>
          <NativeSelect
            id="acc-status"
            name="status"
            defaultValue={query.status ?? ""}
            onChange={send}
          >
            <option value="">All statuses</option>
            {ACCOUNT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="hidden flex-col gap-1 min-[1180px]:flex">
          <Label htmlFor="acc-per">Rows per page</Label>
          <NativeSelect
            ref={per}
            id="acc-per"
            name="per"
            defaultValue={String(query.perPage)}
            onChange={send}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            <Search aria-hidden="true" />
            <span className="min-[1180px]:hidden">Apply</span>
            <span className="hidden min-[1180px]:inline">Search</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
