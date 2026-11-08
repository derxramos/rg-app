"use client";

import { UserPlus } from "lucide-react";
import { useCallback, useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { invitableRoles } from "@/lib/account-rules";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { PASSWORD_MIN } from "@/lib/validation/auth";
import { inviteAccountAction } from "@/app/admin/(protected)/settings/users/actions";

// The "Invite" button above the table. The role choices depend on who is inviting: staff or admin, and
// owner only for an owner. Two ways: an email invitation, or a temporary password (the person must choose
// their own at the first sign in).
export function InviteAccount({ viewerRole }: { viewerRole: Role }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"email" | "password">("email");
  const close = useCallback(() => setOpen(false), []);
  const roles = invitableRoles(viewerRole);
  if (roles.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a person</DialogTitle>
          <DialogDescription>
            For staff and admin accounts. Clients make their own account on the website.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={inviteAccountAction} fresh submitLabel="Invite" onSuccess={close}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-name">Full name</Label>
            <Input id="inv-name" name="fullName" maxLength={100} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" name="email" type="email" maxLength={200} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-role">Role</Label>
            <NativeSelect id="inv-role" name="role" defaultValue="staff">
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-method">How does the person get in?</Label>
            <NativeSelect
              id="inv-method"
              name="method"
              value={method}
              onChange={(event) =>
                setMethod(event.target.value === "password" ? "password" : "email")
              }
            >
              <option value="email">Send an invitation email</option>
              <option value="password">Make a temporary password</option>
            </NativeSelect>
          </div>
          {method === "password" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="inv-pass">Temporary password</Label>
              <Input
                id="inv-pass"
                name="temporaryPassword"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                required
                aria-describedby="inv-pass-help"
              />
              <p id="inv-pass-help" className="text-sm text-muted-foreground">
                At least {PASSWORD_MIN} characters. Tell the person in person or by phone. It is
                never saved or written to the log. They must choose their own password at the first
                sign in.
              </p>
            </div>
          ) : null}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
