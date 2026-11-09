import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { PRIVACY_NOTICE_DATE, PRIVACY_TEMPLATE } from "@/content/privacy-notice";
import { TERMS_DATE, TERMS_TEMPLATE } from "@/content/terms";
import {
  LEGAL_LABELS,
  builtInLegalVersion,
  checkLegalBody,
  cleanLegalBody,
  isLegalKind,
  nextLegalVersion,
  type LegalKind,
} from "@/lib/legal-text";
import { todayInManila } from "@/lib/time";
import { assertCan, type PanelUser } from "@/server/auth/panel-core";
import { setActor } from "@/server/db/actor";
import { activityLog, legalDocuments, profiles } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { SettingsError } from "@/server/services/admin-settings";

// The Privacy notice and the Terms of service: the saved versions, and the built-in text used until the owner
// saves the first version. Saved rows are never changed (a database trigger blocks it), so a client's consent
// always points to the exact words they saw.

export type LegalDocument = {
  kind: LegalKind;
  version: string;
  // Markdown with {{retention_days}} and {{contact_lines}} (see src/lib/legal-text.ts).
  body: string;
  // The day the text was saved (or the date of the built-in text), as an ISO date-time.
  createdAt: Date;
  // True while no version has been saved yet.
  isBuiltIn: boolean;
};

const BUILT_IN: Record<LegalKind, { date: string; body: string }> = {
  privacy: { date: PRIVACY_NOTICE_DATE, body: PRIVACY_TEMPLATE },
  terms: { date: TERMS_DATE, body: TERMS_TEMPLATE },
};

export function builtInLegal(kind: LegalKind): LegalDocument {
  const { date, body } = BUILT_IN[kind];
  return {
    kind,
    version: builtInLegalVersion(date),
    body,
    createdAt: new Date(`${date}T00:00:00+08:00`),
    isBuiltIn: true,
  };
}

// The text visitors see now: the newest saved version, or the built-in text.
export async function getCurrentLegal(db: AppDb, kind: LegalKind): Promise<LegalDocument> {
  const [row] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.kind, kind))
    .orderBy(desc(legalDocuments.createdAt), desc(legalDocuments.version))
    .limit(1);
  if (!row) return builtInLegal(kind);
  return {
    kind,
    version: row.version,
    body: row.body,
    createdAt: row.createdAt,
    isBuiltIn: false,
  };
}

// Only the version, for the consent that is saved with a request or a sign up.
export async function getCurrentLegalVersion(db: AppDb, kind: LegalKind): Promise<string> {
  return (await getCurrentLegal(db, kind)).version;
}

export type LegalVersionRow = {
  version: string;
  createdAt: Date;
  createdByName: string | null;
  isBuiltIn: boolean;
};

// Newest first. The built-in text is the last row until the owner has saved a version.
export async function listLegalVersions(db: AppDb, kind: LegalKind): Promise<LegalVersionRow[]> {
  const rows = await db
    .select({
      version: legalDocuments.version,
      createdAt: legalDocuments.createdAt,
      createdByName: profiles.fullName,
    })
    .from(legalDocuments)
    .leftJoin(profiles, eq(profiles.id, legalDocuments.createdBy))
    .where(eq(legalDocuments.kind, kind))
    .orderBy(desc(legalDocuments.createdAt), desc(legalDocuments.version))
    .limit(50);
  const builtIn = builtInLegal(kind);
  return [
    ...rows.map((row) => ({ ...row, isBuiltIn: false })),
    {
      version: builtIn.version,
      createdAt: builtIn.createdAt,
      createdByName: null,
      isBuiltIn: true,
    },
  ];
}

// The text of one version (to read it, or to start a new version from it). Null when the version is unknown.
export async function getLegalVersion(
  db: AppDb,
  kind: LegalKind,
  version: string,
): Promise<LegalDocument | null> {
  if (version === builtInLegal(kind).version) return builtInLegal(kind);
  const [row] = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.kind, kind), eq(legalDocuments.version, version)))
    .limit(1);
  return row
    ? { kind, version: row.version, body: row.body, createdAt: row.createdAt, isBuiltIn: false }
    : null;
}

// Saves the text as a NEW version. Admin or owner. The version number is made here, so nobody types it.
export async function saveLegalDocument(
  db: AppDb,
  actor: PanelUser,
  input: { kind: string; body: string },
  ipHash?: string | null,
): Promise<{ kind: LegalKind; version: string }> {
  assertCan(actor, "legal_text.edit");
  if (!isLegalKind(input.kind)) throw new SettingsError("invalid", "Unknown document.");
  const kind = input.kind;
  const body = cleanLegalBody(input.body);
  const problem = checkLegalBody(body);
  if (problem) throw new SettingsError("invalid", problem);

  return db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const rows = await tx
      .select({ version: legalDocuments.version, body: legalDocuments.body })
      .from(legalDocuments)
      .where(eq(legalDocuments.kind, kind))
      .orderBy(desc(legalDocuments.createdAt), desc(legalDocuments.version));
    const currentBody = rows[0]?.body ?? BUILT_IN[kind].body;
    if (cleanLegalBody(currentBody) === body)
      throw new SettingsError(
        "invalid",
        "The text is the same as the current version. Nothing was saved.",
      );

    const version = nextLegalVersion(
      todayInManila(),
      rows.map((row) => row.version),
    );
    await tx.insert(legalDocuments).values({ kind, version, body, createdBy: actor.id });
    await tx.insert(activityLog).values({
      actorType: "admin",
      actorId: actor.id,
      action: "legal.published",
      entityType: "legal_document",
      entityId: `${kind}:${version}`,
      details: { document: LEGAL_LABELS[kind], version, characters: body.length },
      ipHash: ipHash ?? null,
    });
    return { kind, version };
  });
}
