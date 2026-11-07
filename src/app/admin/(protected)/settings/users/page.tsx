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
import { ACCOUNT_LIST_LIMIT, listAccounts, listAdmins } from "@/server/services/admin-users";
import { Button } from "@/components/ui/button";

import {
  createAdminWithPasswordAction,
  inviteAdminAction,
  removeAdminAction,
  setAccountRoleAction,
  updateAdminAction,
} from "./actions";

export const metadata: Metadata = { title: "Admin users" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/settings/users">) {
  const me = await guardAdminPage({ roles: OWNER_ONLY });
  const { q } = await searchParams;
  const search = typeof q === "string" ? q : "";
  const [admins, accounts] = await Promise.all([
    listAdmins(getDb()),
    listAccounts(getDb(), search),
  ]);
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
      <section aria-labelledby="existing-accounts" className="flex flex-col gap-3">
        <h2 id="existing-accounts" className="text-xl font-bold">
          Existing accounts
        </h2>
        <p className="max-w-prose text-base text-muted-foreground">
          Everyone who has an account on this website. Choose User or Admin, then Save. A new admin
          starts as Staff. You can change Staff or Owner in the list above.
        </p>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="acc-search">Find by email or name</Label>
            <Input
              id="acc-search"
              name="q"
              type="search"
              defaultValue={search}
              maxLength={100}
              className="w-72 max-w-full"
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        {accounts.length === 0 ? (
          <p className="text-base text-muted-foreground">No accounts found.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {accounts.map((account) => (
              <li key={account.id}>
                <Card className="gap-3 p-4 md:p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-muted-foreground">Email</p>
                    <p className="break-all">{account.email}</p>
                    {account.fullName ? (
                      <p className="text-sm text-muted-foreground break-words">
                        {account.fullName}
                      </p>
                    ) : null}
                    {account.mustChangePassword ? (
                      <p className="text-sm text-muted-foreground">
                        Has a temporary password. Must choose a new one at the first sign in.
                      </p>
                    ) : null}
                  </div>
                  {account.id === me.id ? (
                    <p className="text-sm text-muted-foreground">This is you.</p>
                  ) : (
                    <ActionForm
                      action={setAccountRoleAction}
                      fresh
                      hidden={{ id: account.id }}
                      submitLabel="Save"
                      cancelHref="/admin/settings/users"
                      inline
                    >
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`role-${account.id}`}>Role</Label>
                        <NativeSelect
                          id={`role-${account.id}`}
                          name="role"
                          defaultValue={account.role}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </NativeSelect>
                      </div>
                    </ActionForm>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
        {accounts.length === ACCOUNT_LIST_LIMIT ? (
          <p className="text-sm text-muted-foreground">
            Showing the first {ACCOUNT_LIST_LIMIT}. Use the search box to find someone else.
          </p>
        ) : null}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>New admin account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 max-w-prose text-base">
            Makes a new account that is already an admin, with a temporary password you choose. The
            person must choose their own password the first time they sign in. Tell them the
            temporary password in person or by phone, not by email or chat.
          </p>
          <ActionForm
            action={createAdminWithPasswordAction}
            fresh
            submitLabel="Save"
            cancelHref="/admin/settings/users"
            resetOnSuccess
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="n-name">Full name</Label>
              <Input id="n-name" name="fullName" maxLength={100} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="n-email">Email address</Label>
              <Input
                id="n-email"
                name="email"
                type="email"
                autoComplete="off"
                maxLength={200}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-base font-bold">Role</span>
              <span>
                <Badge variant="primary">Admin</Badge>
              </span>
              <p className="text-sm text-muted-foreground">
                This form only makes admins. Normal users create their own account.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="n-level">Level</Label>
              <NativeSelect id="n-level" name="level" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="owner">Owner</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="n-password">Temporary password</Label>
              <Input
                id="n-password"
                name="temporaryPassword"
                type="password"
                autoComplete="new-password"
                maxLength={72}
                required
                aria-describedby="n-password-help"
              />
              <p id="n-password-help" className="text-sm text-muted-foreground">
                At least 12 characters. A short sentence is easy to say and hard to guess.
              </p>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Or invite someone by email</CardTitle>
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
