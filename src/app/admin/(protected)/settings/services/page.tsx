import { Briefcase } from "lucide-react";
import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle, Pagination } from "@/components/admin/bits";
import { ServicesTable } from "@/components/admin/services-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatFee } from "@/lib/money";
import { can } from "@/lib/permissions";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { listServicesPage } from "@/server/services/admin-settings";

import { createServiceAction } from "../actions";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesSettingsPage({
  searchParams,
}: PageProps<"/admin/settings/services">) {
  const me = await guardPanelPage("services.view", "/admin/settings/services");
  // What this role may do. Hiding a button is not security: the actions and the database check again.
  const canFee = can(me.role, "services.edit_fee");
  const canVisibility = can(me.role, "services.set_visibility");
  const canReorder = can(me.role, "services.reorder");
  const canDelete = can(me.role, "services.delete");
  const { page: pageParam } = await searchParams;
  const requested = Number(typeof pageParam === "string" ? pageParam : 1) || 1;
  const { rows, total, page, perPage, pageCount } = await listServicesPage(getDb(), {
    page: requested,
  });
  const view = rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    fee: row.feeCentavos === null ? "No fee set" : formatFee(row.feeCentavos),
    isActive: row.isActive,
    requestCount: row.requestCount,
    position: (page - 1) * perPage + index,
  }));
  return (
    <>
      <AdminTitle
        title="Services and checklists"
        intro="New services start with an empty checklist. Write only what you are sure about: clients read it."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No services yet"
          description="Add the first one below."
        />
      ) : (
        <>
          <ServicesTable
            rows={view}
            total={total}
            permissions={{ visibility: canVisibility, reorder: canReorder, delete: canDelete }}
          />
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "service" : "services"}, {perPage} per page.
          </p>
          <Pagination
            basePath="/admin/settings/services"
            params={{}}
            page={page}
            pageCount={pageCount}
          />
        </>
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
