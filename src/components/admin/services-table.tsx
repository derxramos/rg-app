"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import { CardList, TableBox } from "@/components/admin/data-views";
import Link from "next/link";
import { useCallback, useState, useTransition } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteServicesAction, serviceListAction } from "@/app/admin/(protected)/settings/actions";

export type ServiceRowView = {
  id: string;
  name: string;
  fee: string;
  isActive: boolean;
  // How many requests used this service. A service with requests cannot be deleted.
  requestCount: number;
  // Place in the whole list (0 = first), so "Move up" and "Move down" are right on every page.
  position: number;
};

type Permissions = { visibility: boolean; reorder: boolean; delete: boolean };

// The services list: a table from 768 px, cards on a phone. The columns have fixed widths so every row lines up.
// Admin and owner can tick services and delete them (one or many) after the confirm. Staff see the list and can
// open a service to change its words. Showing a button is only for comfort: the server and the database check again.
export function ServicesTable({
  rows,
  total,
  permissions,
}: {
  rows: ServiceRowView[];
  total: number;
  permissions: Permissions;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const closeDelete = useCallback(() => {
    setDeleteIds(null);
    setSelected(new Set());
  }, []);

  const hasActions = permissions.visibility || permissions.reorder || permissions.delete;
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on: boolean) =>
    setSelected(on ? new Set(rows.map((row) => row.id)) : new Set());

  const statusBadge = (row: ServiceRowView) => (
    <Badge variant={row.isActive ? "success" : "neutral"}>{row.isActive ? "On" : "Off"}</Badge>
  );
  const nameLink = (row: ServiceRowView) => (
    <Link
      href={`/admin/settings/services/${row.id}`}
      className="inline-flex min-h-11 items-center font-bold break-words text-primary underline underline-offset-4 min-[1180px]:min-h-0"
    >
      {row.name}
    </Link>
  );
  const actions = (row: ServiceRowView) =>
    hasActions ? (
      <ServiceRowActions
        row={row}
        total={total}
        permissions={permissions}
        onDelete={() => setDeleteIds([row.id])}
      />
    ) : (
      <span className="text-muted-foreground" title="No actions for your role">
        –
      </span>
    );

  // Column widths in percent. They add up to 100.
  const widths = permissions.delete ? [6, 44, 20, 12, 18] : [50, 22, 12, 16];

  return (
    <>
      {permissions.delete && selected.size > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-primary-soft p-3 text-primary-ink"
        >
          <span className="font-bold">
            {selected.size} {selected.size === 1 ? "service" : "services"} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteIds([...selected])}>
              <Trash2 aria-hidden="true" />
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}

      {/* Phones: one card per service. */}
      <CardList aria-label="Services">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="gap-3 p-4 md:p-4">
              <div className="flex items-start gap-3">
                {permissions.delete ? (
                  <label className="flex min-h-11 min-w-11 items-center justify-center">
                    <Checkbox
                      aria-label={`Select ${row.name}`}
                      checked={selected.has(row.id)}
                      onCheckedChange={(value) => toggle(row.id, value === true)}
                    />
                  </label>
                ) : null}
                <div className="min-w-0 flex-1">{nameLink(row)}</div>
                {actions(row)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span className="text-muted-foreground">{row.fee}</span>
                {statusBadge(row)}
              </div>
            </Card>
          </li>
        ))}
      </CardList>

      {/* From 1180 px: a table with fixed column widths. */}
      <TableBox>
        <Table className="table-fixed">
          <colgroup>
            {widths.map((width, index) => (
              <col key={index} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              {permissions.delete ? (
                <TableHead scope="col">
                  <span className="flex">
                    <Checkbox
                      aria-label="Select all services on this page"
                      checked={allSelected}
                      onCheckedChange={(value) => toggleAll(value === true)}
                    />
                  </span>
                </TableHead>
              ) : null}
              <TableHead scope="col">Service</TableHead>
              <TableHead scope="col" className="text-right">
                Service fee
              </TableHead>
              <TableHead scope="col">On / Off</TableHead>
              <TableHead scope="col">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                {permissions.delete ? (
                  <TableCell>
                    <span className="flex">
                      <Checkbox
                        aria-label={`Select ${row.name}`}
                        checked={selected.has(row.id)}
                        onCheckedChange={(value) => toggle(row.id, value === true)}
                      />
                    </span>
                  </TableCell>
                ) : null}
                <TableCell className="truncate">{nameLink(row)}</TableCell>
                <TableCell className="text-right">{row.fee}</TableCell>
                <TableCell>{statusBadge(row)}</TableCell>
                <TableCell>{actions(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableBox>

      <Dialog open={deleteIds !== null} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {deleteIds?.length === 1 ? "this service" : `${deleteIds?.length ?? 0} services`}
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. The checklist of a deleted service goes with it. A service that
              clients already used in a request is kept (turn it off instead).
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-base">
            {(deleteIds ?? []).map((id) => {
              const row = rows.find((r) => r.id === id);
              return (
                <li key={id}>
                  {row?.name ?? id}
                  {row && row.requestCount > 0 ? (
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      (used by {row.requestCount} {row.requestCount === 1 ? "request" : "requests"}:
                      will be kept)
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <ActionForm
            action={deleteServicesAction}
            fresh
            variant="destructive"
            submitLabel={deleteIds?.length === 1 ? "Delete the service" : "Delete the services"}
            onSuccess={closeDelete}
          >
            {(deleteIds ?? []).map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

// The "Actions" menu of one service: turn on or off, move up or down, delete. Only what the role may do is shown.
function ServiceRowActions({
  row,
  total,
  permissions,
  onDelete,
}: {
  row: ServiceRowView;
  total: number;
  permissions: Permissions;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function run(intent: "on" | "off" | "up" | "down") {
    const data = new FormData();
    data.set("id", row.id);
    data.set("intent", intent);
    startTransition(async () => {
      const result = await serviceListAction(null, data);
      if (result.ok) notify.success(result.message ?? "Done.");
      else notify.error(result.message);
    });
  }

  const canUp = permissions.reorder && row.position > 0;
  const canDown = permissions.reorder && row.position < total - 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          aria-label={`Actions for ${row.name}`}
        >
          Actions
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {permissions.visibility ? (
          <DropdownMenuItem onSelect={() => run(row.isActive ? "off" : "on")}>
            {row.isActive ? "Turn off" : "Turn on"}
          </DropdownMenuItem>
        ) : null}
        {canUp ? <DropdownMenuItem onSelect={() => run("up")}>Move up</DropdownMenuItem> : null}
        {canDown ? (
          <DropdownMenuItem onSelect={() => run("down")}>Move down</DropdownMenuItem>
        ) : null}
        {permissions.delete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-danger-ink data-[highlighted]:bg-danger-soft"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
