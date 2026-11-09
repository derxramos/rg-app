import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTitle } from "@/components/admin/bits";
import { LegalEditor } from "@/components/admin/legal-editor";
import { WarningBox } from "@/components/shared/warning-box";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { settingsTrail } from "@/lib/crumbs";
import { LEGAL_LABELS, isLegalKind } from "@/lib/legal-text";
import { formatManilaDateTime } from "@/lib/time";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { getCurrentLegal, getLegalVersion, listLegalVersions } from "@/server/services/legal";
import { readSetting } from "@/server/services/settings";

import { saveLegalAction } from "../actions";

export const metadata: Metadata = { title: "Edit privacy or terms" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export default async function EditLegalPage({
  params,
  searchParams,
}: PageProps<"/admin/settings/legal/[kind]">) {
  const admin = await guardPanelPage("legal_text.edit", "/admin/settings/legal/[kind]");
  const { kind } = await params;
  if (!isLegalKind(kind)) notFound();
  const { v } = await searchParams;
  const db = getDb();

  const [current, versions, contact, retentionDays] = await Promise.all([
    getCurrentLegal(db, kind),
    listLegalVersions(db, kind),
    readSetting(db, "contact"),
    readSetting(db, "file_retention_days"),
  ]);
  // "?v=" opens an older version in the box. Saving it makes a NEW version (the old one stays as it was).
  const requested = one(v);
  const start = (requested ? await getLegalVersion(db, kind, requested) : null) ?? current;
  const label = LEGAL_LABELS[kind];

  return (
    <>
      <AdminTitle
        title={`Edit the ${label.toLowerCase()}`}
        crumbs={[
          ...settingsTrail(admin.role),
          { label: "Privacy and terms", href: "/admin/settings/legal" },
          { label },
        ]}
        intro={`Now live: version ${current.version}.`}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              {start.version === current.version
                ? "Text"
                : `Text of version ${start.version} (not live)`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WarningBox variant="warning" title="Every save is a new version">
              Clients agree to the version they see when they send a request, and we keep that
              version with the request. Saving makes a new version number. It does not change what
              earlier clients agreed to. This is legal text: check it carefully before you save.
            </WarningBox>
            <LegalEditor
              key={start.version}
              kind={kind}
              initialBody={start.body}
              facts={{
                retentionDays,
                contactEmail: contact.email,
                contactPhone: contact.phone,
              }}
              action={saveLegalAction}
              cancelHref="/admin/settings/legal"
            />
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Versions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {versions.map((row) => (
                <li key={row.version} className="flex flex-col gap-1 py-3">
                  <span className="font-bold">
                    Version {row.version}
                    {row.version === current.version ? " (live)" : ""}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatManilaDateTime(row.createdAt)}
                    {row.isBuiltIn
                      ? " · came with the app"
                      : row.createdByName
                        ? ` · ${row.createdByName}`
                        : ""}
                  </span>
                  {row.version !== start.version ? (
                    <Link
                      href={`/admin/settings/legal/${kind}?v=${encodeURIComponent(row.version)}`}
                      className="min-h-11 py-2 text-primary underline underline-offset-4"
                    >
                      Open this text in the box
                    </Link>
                  ) : (
                    <span className="text-sm">In the box now</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
