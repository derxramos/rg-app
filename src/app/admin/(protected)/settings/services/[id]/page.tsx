import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle } from "@/components/admin/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { guardAdminPage } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getServiceWithRequirements } from "@/server/services/admin-settings";

import { requirementAction, updateServiceAction } from "../../actions";

export const metadata: Metadata = { title: "Edit service" };

export default async function EditServicePage({
  params,
}: PageProps<"/admin/settings/services/[id]">) {
  await guardAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await getServiceWithRequirements(getDb(), id);
  if (!found) notFound();
  const { service, requirements } = found;

  return (
    <>
      <AdminTitle title={service.name} />
      <Card>
        <CardHeader>
          <CardTitle>Service</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updateServiceAction}
            hidden={{ id: service.id }}
            submitLabel="Save service"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-name">Name</Label>
              <Input id="e-name" name="name" defaultValue={service.name} maxLength={120} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-short">Short description</Label>
              <Input
                id="e-short"
                name="shortDescription"
                defaultValue={service.shortDescription}
                maxLength={300}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-desc">Description (Markdown)</Label>
              <Textarea
                id="e-desc"
                name="description"
                defaultValue={service.description}
                maxLength={10000}
                className="min-h-40"
              />
            </div>
            <CheckboxRow htmlFor="e-active">
              <Checkbox id="e-active" name="isActive" defaultChecked={service.isActive} />
              <span>Show this service on the website</span>
            </CheckboxRow>
          </ActionForm>
        </CardContent>
      </Card>

      <section aria-labelledby="checklist" className="flex flex-col gap-4">
        <h2 id="checklist" className="text-xl font-bold">
          Checklist (documents the client prepares)
        </h2>
        {requirements.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="The checklist is empty"
            description="Clients will see: Please contact us for the list of requirements."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {requirements.map((r, index) => (
              <li key={r.id}>
                <Card className="gap-3 p-4 md:p-4">
                  <ActionForm
                    action={requirementAction}
                    hidden={{ id: r.id, serviceId: service.id, intent: "save" }}
                    submitLabel="Save item"
                    size="sm"
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`l-${r.id}`}>Item</Label>
                      <Input
                        id={`l-${r.id}`}
                        name="label"
                        defaultValue={r.label}
                        maxLength={150}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`d-${r.id}`}>Help text (optional)</Label>
                      <Input
                        id={`d-${r.id}`}
                        name="details"
                        defaultValue={r.details ?? ""}
                        maxLength={500}
                      />
                    </div>
                    <CheckboxRow htmlFor={`q-${r.id}`}>
                      <Checkbox id={`q-${r.id}`} name="isRequired" defaultChecked={r.isRequired} />
                      <span>Required</span>
                    </CheckboxRow>
                  </ActionForm>
                  <div className="flex flex-wrap gap-2">
                    {index > 0 ? (
                      <ActionForm
                        action={requirementAction}
                        hidden={{ id: r.id, serviceId: service.id, intent: "up" }}
                        submitLabel="Move up"
                        variant="ghost"
                        size="sm"
                      >
                        <span />
                      </ActionForm>
                    ) : null}
                    {index < requirements.length - 1 ? (
                      <ActionForm
                        action={requirementAction}
                        hidden={{ id: r.id, serviceId: service.id, intent: "down" }}
                        submitLabel="Move down"
                        variant="ghost"
                        size="sm"
                      >
                        <span />
                      </ActionForm>
                    ) : null}
                    <ActionForm
                      action={requirementAction}
                      hidden={{ id: r.id, serviceId: service.id, intent: "delete" }}
                      submitLabel="Delete"
                      variant="destructive"
                      size="sm"
                    >
                      <span />
                    </ActionForm>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Add an item</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={requirementAction}
              hidden={{ serviceId: service.id, intent: "add" }}
              submitLabel="Add item"
              resetOnSuccess
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="n-label">Item</Label>
                <Input id="n-label" name="label" maxLength={150} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="n-details">Help text (optional)</Label>
                <Input id="n-details" name="details" maxLength={500} />
              </div>
              <CheckboxRow htmlFor="n-req">
                <Checkbox id="n-req" name="isRequired" defaultChecked />
                <span>Required</span>
              </CheckboxRow>
            </ActionForm>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
