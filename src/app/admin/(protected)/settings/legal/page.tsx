import { Scale } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminTitle } from "@/components/admin/bits";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { settingsTrail } from "@/lib/crumbs";
import { LEGAL_KINDS, LEGAL_LABELS } from "@/lib/legal-text";
import { formatManilaDate } from "@/lib/time";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { getCurrentLegal } from "@/server/services/legal";

export const metadata: Metadata = { title: "Privacy and terms" };

const PUBLIC_PATH = { privacy: "/privacy", terms: "/terms" } as const;

export default async function LegalListPage() {
  const admin = await guardPanelPage("legal_text.edit", "/admin/settings/legal");
  const db = getDb();
  const current = await Promise.all(LEGAL_KINDS.map((kind) => getCurrentLegal(db, kind)));

  return (
    <>
      <AdminTitle
        title="Privacy and terms"
        crumbs={[...settingsTrail(admin.role), { label: "Privacy and terms" }]}
        intro="The words clients agree to. Every save makes a new version. Old versions are kept."
      />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {current.map((doc) => (
          <li key={doc.kind}>
            <Card className="h-full">
              <CardHeader>
                <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
                  <Scale aria-hidden="true" className="size-6" />
                </span>
                <CardTitle>{LEGAL_LABELS[doc.kind]}</CardTitle>
                <CardDescription className="text-base">
                  Version {doc.version}, {formatManilaDate(doc.createdAt)}
                  {doc.isBuiltIn ? " (the text that came with the app)" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <Link
                    href={`/admin/settings/legal/${doc.kind}`}
                    className="min-h-11 py-2 font-bold text-primary underline underline-offset-4"
                  >
                    Edit
                  </Link>
                  <Link
                    href={PUBLIC_PATH[doc.kind]}
                    className="min-h-11 py-2 text-primary underline underline-offset-4"
                  >
                    See it on the website
                  </Link>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
