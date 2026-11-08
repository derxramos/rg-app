"use client";

import { Search } from "lucide-react";
import { useRef } from "react";

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

// Search, filters and rows per page. It is a normal GET form, so everything ends up in the web address
// (?q=&role=&status=&per=) and the server does the work. A change in a list sends the form at once.
// Page 1 is shown again after every change (the page number is not part of the form).
export function AccountsToolbar({ query }: { query: AccountQuery }) {
  const form = useRef<HTMLFormElement>(null);
  const send = () => form.current?.requestSubmit();

  return (
    <form
      ref={form}
      method="get"
      role="search"
      aria-label="Search and filter accounts"
      className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_auto]"
    >
      <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="acc-q">Search by name or email</Label>
        <Input id="acc-q" name="q" type="search" defaultValue={query.q} maxLength={100} />
      </div>
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
      <div className="flex flex-col gap-1">
        <Label htmlFor="acc-per">Rows per page</Label>
        <NativeSelect id="acc-per" name="per" defaultValue={String(query.perPage)} onChange={send}>
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
          Search
        </Button>
      </div>
    </form>
  );
}
