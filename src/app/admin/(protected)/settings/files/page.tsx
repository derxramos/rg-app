import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle } from "@/components/admin/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardAdminPage } from "@/server/auth/admin";
import { OWNER_ONLY } from "@/server/auth/admin-core";
import { getDb } from "@/server/db/client";
import { readSetting } from "@/server/services/settings";

import { saveSettingAction } from "../actions";

export const metadata: Metadata = { title: "File settings" };

export default async function FileSettingsPage() {
  await guardAdminPage({ roles: OWNER_ONLY });
  const db = getDb();
  const [days, maxFiles, maxMb, warn] = await Promise.all([
    readSetting(db, "file_retention_days"),
    readSetting(db, "max_files_per_request"),
    readSetting(db, "max_file_size_mb"),
    readSetting(db, "storage_warning_percent"),
  ]);
  const rows = [
    {
      key: "file_retention_days",
      label: "Days to keep files after a request is Completed or Cancelled",
      value: days,
      hint: "1 to 365. The daily cleanup job deletes the files after this time.",
    },
    {
      key: "max_files_per_request",
      label: "Most files for one request",
      value: maxFiles,
      hint: "1 to 50.",
    },
    {
      key: "max_file_size_mb",
      label: "Biggest file (MB)",
      value: maxMb,
      hint: "1 to 10. Photos are made smaller on the phone first.",
    },
    {
      key: "storage_warning_percent",
      label: "Storage warning (percent)",
      value: warn,
      hint: "The dashboard turns yellow at this percent, and red at 95.",
    },
  ];
  return (
    <>
      <AdminTitle
        title="File settings"
        intro="Limits for uploaded documents. The free storage is 1 GB, so these protect it."
      />
      <div className="grid gap-6 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.key}>
            <CardHeader>
              <CardTitle className="text-base">{r.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={saveSettingAction}
                hidden={{ key: r.key }}
                submitLabel="Save"
                inline
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor={r.key} className="sr-only">
                    {r.label}
                  </Label>
                  <Input
                    id={r.key}
                    name="value"
                    type="number"
                    inputMode="numeric"
                    defaultValue={r.value}
                    className="max-w-40"
                  />
                </div>
              </ActionForm>
              <p className="text-sm text-muted-foreground">{r.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
