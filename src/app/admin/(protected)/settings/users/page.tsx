import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle } from "@/components/admin/bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { formatManilaDateTime } from "@/lib/time";
import { guardAdminPage } from "@/server/auth/admin";
import { OWNER_ONLY } from "@/server/auth/admin-core";
import { getDb } from "@/server/db/client";
import { listAdmins } from "@/server/services/admin-users";

import {
  inviteAdminAction,
  promoteAdminAction,
  removeAdminAction,
  updateAdminAction,
} from "./actions";

export const metadata: Metadata = { title: "Admin users" };

export default async function AdminUsersPage() {
  const me = await guardAdminPage({ roles: OWNER_ONLY });
  const admins = await listAdmins(getDb());
  return (
    <>
      <AdminTitle
        title="Admin users"
        intro="Every change here needs a fresh code from your authenticator app."
      />
      <ul className="flex flex-col gap-3">
        {admins.map((a) => (
          <li key={a.id}>
            <Card className="gap-3 p-4 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold break-words">{a.fullName}</p>
                  <p className="text-sm text-muted-foreground break-all">
                    {a.email} · last login{" "}
                    {a.lastLoginAt ? formatManilaDateTime(a.lastLoginAt) : "never"}
                  </p>
                </div>
                <span className="flex gap-2">
                  <Badge variant="primary">{a.role === "owner" ? "Owner" : "Staff"}</Badge>
                  <Badge variant={a.isActive ? "success" : "neutral"}>
                    {a.isActive ? "Active" : "Off"}
                  </Badge>
                </span>
              </div>
              {a.id !== me.id ? (
                <div className="flex flex-wrap gap-2">
                  <ActionForm
                    action={updateAdminAction}
                    fresh
                    hidden={{ id: a.id, intent: a.isActive ? "off" : "on" }}
                    submitLabel={a.isActive ? "Turn off" : "Turn on"}
                    variant="outline"
                    size="sm"
                  >
                    <span />
                  </ActionForm>
                  <ActionForm
                    action={updateAdminAction}
                    fresh
                    hidden={{ id: a.id, intent: a.role === "owner" ? "staff" : "owner" }}
                    submitLabel={a.role === "owner" ? "Make staff" : "Make owner"}
                    variant="ghost"
                    size="sm"
                  >
                    <span />
                  </ActionForm>
                  {a.isActive ? (
                    <ActionForm
                      action={removeAdminAction}
                      fresh
                      hidden={{ id: a.id }}
                      submitLabel="Remove admin"
                      variant="destructive"
                      size="sm"
                    >
                      <span />
                    </ActionForm>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This is you.</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>Make an existing account an admin</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base">
            The person must already have an account on this website. Type the email they used.
            &ldquo;Remove admin&rdquo; above turns them back into a normal user.
          </p>
          <ActionForm action={promoteAdminAction} fresh submitLabel="Make admin" resetOnSuccess>
            <div className="flex flex-col gap-2">
              <Label htmlFor="p-email">Account email</Label>
              <Input id="p-email" name="email" type="email" maxLength={200} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="p-role">Level</Label>
              <NativeSelect id="p-role" name="role" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="owner">Owner</option>
              </NativeSelect>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={inviteAdminAction} fresh submitLabel="Send invitation" resetOnSuccess>
            <div className="flex flex-col gap-2">
              <Label htmlFor="i-name">Full name</Label>
              <Input id="i-name" name="fullName" maxLength={100} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="i-email">Email</Label>
              <Input id="i-email" name="email" type="email" maxLength={200} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="i-role">Role</Label>
              <NativeSelect id="i-role" name="role" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="owner">Owner</option>
              </NativeSelect>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
