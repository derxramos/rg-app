"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Button } from "@/components/ui/button";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { accountActionsFor, assignableRoles, type AccountActionRow } from "@/lib/account-rules";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import {
  changeRoleAction,
  reset2faAction,
  resendInviteAction,
  setActiveAction,
} from "@/app/admin/(protected)/settings/users/actions";

type Row = AccountActionRow & { email: string; fullName: string };
type DialogKind = "role" | "active" | "resend" | "reset" | null;

// The "Actions" menu of one account. Each choice opens ONE dialog with ONE confirm: the code (or the
// password, when there is no authenticator yet) of the person who is making the change, never of the
// other account. There is no delete.
export function AccountRowActions({
  viewer,
  account,
}: {
  viewer: { id: string; role: Role };
  account: Row;
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const close = useCallback(() => setDialog(null), []);
  const actions = accountActionsFor(viewer, account);
  const label = account.fullName || account.email;

  if (!Object.values(actions).some(Boolean)) {
    return (
      <span className="text-muted-foreground" title="No actions for this account">
        –
      </span>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label={`Actions for ${label}`}>
            Actions
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {actions.changeRole ? (
            <DropdownMenuItem onSelect={() => setDialog("role")}>Change role</DropdownMenuItem>
          ) : null}
          {actions.reset2fa ? (
            <DropdownMenuItem onSelect={() => setDialog("reset")}>
              Reset 2-step login
            </DropdownMenuItem>
          ) : null}
          {actions.toggleActive ? (
            <DropdownMenuItem onSelect={() => setDialog("active")}>
              {account.isActive ? "Turn account off" : "Turn account on"}
            </DropdownMenuItem>
          ) : null}
          {actions.resendInvite ? (
            <DropdownMenuItem onSelect={() => setDialog("resend")}>Resend invite</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "role"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {label} ({ROLE_LABELS[account.role]}). The person gets an email about the change.
            </DialogDescription>
          </DialogHeader>
          <ActionForm
            action={changeRoleAction}
            hidden={{ id: account.id }}
            fresh
            submitLabel="Change role"
            onSuccess={close}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`role-${account.id}`}>New role</Label>
              <NativeSelect id={`role-${account.id}`} name="role" defaultValue={account.role}>
                {assignableRoles(viewer.role).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "active"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{account.isActive ? "Turn account off" : "Turn account on"}</DialogTitle>
            <DialogDescription>
              {account.isActive
                ? `${label} will be signed out everywhere and cannot sign in until you turn the account on again. Their data is kept.`
                : `${label} will be able to sign in again.`}{" "}
              The person gets an email about the change.
            </DialogDescription>
          </DialogHeader>
          <ActionForm
            action={setActiveAction}
            hidden={{ id: account.id, intent: account.isActive ? "off" : "on" }}
            fresh
            variant={account.isActive ? "destructive" : "default"}
            submitLabel={account.isActive ? "Turn off" : "Turn on"}
            onSuccess={close}
          >
            <span />
          </ActionForm>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "reset"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset 2-step login</DialogTitle>
            <DialogDescription>
              Use this when {label} lost their phone. All their authenticator devices are removed,
              they are signed out everywhere, and at the next sign in they must set up a new
              authenticator AND a backup device. They get an email
              {account.role === "owner" ? ", and so does every owner" : ""}.
            </DialogDescription>
          </DialogHeader>
          <ActionForm
            action={reset2faAction}
            hidden={{ id: account.id }}
            fresh
            variant="destructive"
            submitLabel="Reset 2-step login"
            onSuccess={close}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`reset-${account.id}`}>
                To confirm, type the email of this person: {account.email}
              </Label>
              <Input
                id={`reset-${account.id}`}
                name="confirmEmail"
                type="email"
                autoComplete="off"
                required
              />
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "resend"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resend invite</DialogTitle>
            <DialogDescription>
              {label} has not opened the first email yet. We send it again to {account.email}.
            </DialogDescription>
          </DialogHeader>
          <ActionForm
            action={resendInviteAction}
            hidden={{ id: account.id }}
            fresh
            submitLabel="Send the email again"
            onSuccess={close}
          >
            <span />
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
