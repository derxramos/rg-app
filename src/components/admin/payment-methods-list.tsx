"use client";

import { ChevronDown, Trash2 } from "lucide-react";
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
  deletePaymentMethodsAction,
  paymentMethodListAction,
} from "@/app/admin/(protected)/settings/payments/actions";

export type PaymentMethodRowView = {
  id: string;
  name: string;
  // The account name and the "changed" date, already written out by the page.
  detail: string;
  isActive: boolean;
  // How many payments used this method. A method that payments used cannot be deleted.
  paymentCount: number;
};

// The payment methods list: one card per method. Tick one or more and delete them from here, after the confirm
// and a fresh 2FA code (same as the Services list). "Turn off or on" stays a visible button because it is the
// everyday action. Move up, Move down and Delete are in the Actions menu. Only admin and owner open this page,
// and the server and the database check again.
export function PaymentMethodsList({ rows }: { rows: PaymentMethodRowView[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const closeDelete = useCallback(() => {
    setDeleteIds(null);
    setSelected(new Set());
  }, []);

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

  return (
    <>
      {selected.size > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-primary-soft p-3 text-primary-ink"
        >
          <span className="font-bold">
            {selected.size} {selected.size === 1 ? "method" : "methods"} selected
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

      <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-base">
        <Checkbox
          aria-label="Select all payment methods"
          checked={allSelected}
          onCheckedChange={(value) => toggleAll(value === true)}
        />
        Select all
      </label>

      <ul className="flex flex-col gap-3" aria-label="Payment methods">
        {rows.map((row, index) => (
          <li key={row.id}>
            <Card
              className="gap-3 p-4 md:p-4 data-[selected=true]:border-primary"
              data-selected={selected.has(row.id)}
            >
              <div className="flex items-start gap-3">
                <label className="flex min-h-11 min-w-11 items-center justify-center">
                  <Checkbox
                    aria-label={`Select ${row.name}`}
                    checked={selected.has(row.id)}
                    onCheckedChange={(value) => toggle(row.id, value === true)}
                  />
                </label>
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      href={`/admin/settings/payments/${row.id}`}
                      className="inline-flex min-h-11 items-center text-lg font-bold text-primary underline underline-offset-4"
                    >
                      {row.name}
                    </Link>
                    <span className="text-sm text-muted-foreground">{row.detail}</span>
                  </div>
                  <Badge variant={row.isActive ? "success" : "neutral"}>
                    {row.isActive ? "On (clients see it)" : "Off"}
                  </Badge>
                </div>
              </div>
              <PaymentMethodRowActions
                row={row}
                canMoveUp={index > 0}
                canMoveDown={index < rows.length - 1}
                onDelete={() => setDeleteIds([row.id])}
              />
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={deleteIds !== null} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {deleteIds?.length === 1
                ? "this payment method"
                : `${deleteIds?.length ?? 0} payment methods`}
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. Clients will no longer see it. A method that payments already
              used is kept (turn it off instead).
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-base">
            {(deleteIds ?? []).map((id) => {
              const row = rows.find((r) => r.id === id);
              return (
                <li key={id}>
                  {row?.name ?? id}
                  {row && row.paymentCount > 0 ? (
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      (used by {row.paymentCount} {row.paymentCount === 1 ? "payment" : "payments"}:
                      will be kept)
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <ActionForm
            action={deletePaymentMethodsAction}
            fresh
            variant="destructive"
            submitLabel={
              deleteIds?.length === 1 ? "Delete the payment method" : "Delete the payment methods"
            }
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

// "Turn off / Turn on" is a button. "Move up", "Move down" and "Delete" are in the Actions menu. Only the moves
// that make sense are shown (the first method has no "Move up").
function PaymentMethodRowActions({
  row,
  canMoveUp,
  canMoveDown,
  onDelete,
}: {
  row: PaymentMethodRowView;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function run(intent: "on" | "off" | "up" | "down") {
    const data = new FormData();
    data.set("id", row.id);
    data.set("intent", intent);
    startTransition(async () => {
      const result = await paymentMethodListAction(null, data);
      if (result.ok) notify.success(result.message ?? "Done.");
      else notify.error(result.message);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        loading={pending}
        onClick={() => run(row.isActive ? "off" : "on")}
      >
        {row.isActive ? "Turn off" : "Turn on"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Actions for ${row.name}`}>
            Actions
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canMoveUp ? (
            <DropdownMenuItem onSelect={() => run("up")}>Move up</DropdownMenuItem>
          ) : null}
          {canMoveDown ? (
            <DropdownMenuItem onSelect={() => run("down")}>Move down</DropdownMenuItem>
          ) : null}
          {canMoveUp || canMoveDown ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-danger-ink data-[highlighted]:bg-danger-soft"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
