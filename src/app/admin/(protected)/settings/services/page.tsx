import { Briefcase } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle } from "@/components/admin/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatFee } from "@/lib/money";
import { can } from "@/lib/permissions";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { listAllServices } from "@/server/services/admin-settings";

import { createServiceAction, serviceListAction } from "../actions";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesSettingsPage() {
  const me = await guardPanelPage("services.view", "/admin/settings/services");
  // What this role may do. Hiding a button is not security: the actions and the database check again.
  const canFee = can(me.role, "services.edit_fee");
  const canVisibility = can(me.role, "services.set_visibility");
  const canReorder = can(me.role, "services.reorder");
  const list = await listAllServices(getDb());
  return (
    <>
      <AdminTitle
        title="Services and checklists"
        intro="New services start with an empty checklist. Write only what you are sure about: clients read it."
      />
      {list.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No services yet"
          description="Add the first one below."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((s, index) => (
            <li key={s.id}>
              <Card className="gap-3 p-4 md:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    href={`/admin/settings/services/${s.id}`}
                    className="min-w-0 text-lg font-bold break-words text-primary underline underline-offset-4"
                  >
                    {s.name}
                  </Link>
                  <span className="text-base text-muted-foreground">
                    {s.feeCentavos === null ? "No fee set" : formatFee(s.feeCentavos)}
                  </span>
                  <Badge variant={s.isActive ? "success" : "neutral"}>
                    {s.isActive ? "On" : "Off"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canVisibility ? (
                    <ActionForm
                      action={serviceListAction}
                      hidden={{ id: s.id, intent: s.isActive ? "off" : "on" }}
                      submitLabel={s.isActive ? "Turn off" : "Turn on"}
                      variant="outline"
                      size="sm"
                    >
                      <span />
                    </ActionForm>
                  ) : null}
                  {canReorder && index > 0 ? (
                    <ActionForm
                      action={serviceListAction}
                      hidden={{ id: s.id, intent: "up" }}
                      submitLabel="Move up"
                      variant="ghost"
                      size="sm"
                    >
                      <span />
                    </ActionForm>
                  ) : null}
                  {canReorder && index < list.length - 1 ? (
                    <ActionForm
                      action={serviceListAction}
                      hidden={{ id: s.id, intent: "down" }}
                      submitLabel="Move down"
                      variant="ghost"
                      size="sm"
                    >
                      <span />
                    </ActionForm>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Add a service</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createServiceAction} submitLabel="Create service">
            <div className="flex flex-col gap-2">
              <Label htmlFor="svc-name">Name</Label>
              <Input id="svc-name" name="name" maxLength={120} required />
            </div>
            {canFee ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="svc-fee">Service fee (Philippine pesos)</Label>
                <Input
                  id="svc-fee"
                  name="fee"
                  inputMode="decimal"
                  placeholder="Example: 5000"
                  maxLength={14}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="svc-short">Short description (for the list)</Label>
              <Input id="svc-short" name="shortDescription" maxLength={300} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="svc-desc">Description (Markdown)</Label>
              <Textarea id="svc-desc" name="description" maxLength={10000} />
            </div>
            {canVisibility ? (
              <CheckboxRow htmlFor="svc-active">
                <Checkbox id="svc-active" name="isActive" defaultChecked />
                <span>Show this service on the website</span>
              </CheckboxRow>
            ) : (
              <p className="text-sm text-muted-foreground">
                A new service starts hidden and with no fee. The owner or the admin sets the fee and
                shows it on the website.
              </p>
            )}
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
