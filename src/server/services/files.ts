import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { DEFAULT_SETTINGS, parseSetting } from "@/lib/validation/settings";
import { requestFiles, requests, serviceRequirements, siteSettings } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { cleanFileName, detectFileType } from "@/server/security/file-type";
import type { StorageDriver } from "@/server/storage/types";

// The Supabase free plan has 1 GB of file storage. Uploads stop at 95 percent (docs/SECURITY_AND_PRIVACY.md T5).
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
export const STORAGE_STOP_PERCENT = 95;

export type UploadErrorCode =
  "empty" | "too-big" | "bad-type" | "too-many" | "storage-full" | "bad-requirement" | "not-draft";

// Messages are written for the client, in plain words.
const MESSAGES: Record<UploadErrorCode, string> = {
  empty: "That file is empty. Please choose another one.",
  "too-big": "That file is too big.",
  "bad-type": "We can only accept JPG, PNG and PDF files. This file looks like a different type.",
  "too-many": "You have reached the most files allowed for one request.",
  "storage-full": "We cannot take new files right now. Please contact us.",
  "bad-requirement": "That checklist item does not belong to this request.",
  "not-draft": "Files cannot be changed now.",
};

export class UploadError extends Error {
  constructor(
    public code: UploadErrorCode,
    detail?: string,
  ) {
    super(detail ?? MESSAGES[code]);
  }
}

export async function getUploadLimits(db: AppDb) {
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(sql`${siteSettings.key} in ('max_files_per_request', 'max_file_size_mb')`);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    maxFiles: byKey.has("max_files_per_request")
      ? parseSetting("max_files_per_request", byKey.get("max_files_per_request"))
      : DEFAULT_SETTINGS.max_files_per_request,
    maxBytes:
      (byKey.has("max_file_size_mb")
        ? parseSetting("max_file_size_mb", byKey.get("max_file_size_mb"))
        : DEFAULT_SETTINGS.max_file_size_mb) *
      1024 *
      1024,
  };
}

// Total size of the files that still exist (not removed by the cleanup job).
export async function storageUsedBytes(db: AppDb): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${requestFiles.sizeBytes}), 0)` })
    .from(requestFiles)
    .where(isNull(requestFiles.deletedAt));
  return Number(row.total);
}

export async function listFiles(db: AppDb, requestId: string) {
  return db
    .select({
      id: requestFiles.id,
      requirementId: requestFiles.requirementId,
      originalName: requestFiles.originalName,
      sizeBytes: requestFiles.sizeBytes,
      mimeType: requestFiles.mimeType,
    })
    .from(requestFiles)
    .where(and(eq(requestFiles.requestId, requestId), isNull(requestFiles.deletedAt)))
    .orderBy(asc(requestFiles.uploadedAt));
}

export async function listRequirementsForRequest(db: AppDb, serviceId: string) {
  return db
    .select({
      id: serviceRequirements.id,
      label: serviceRequirements.label,
      details: serviceRequirements.details,
      isRequired: serviceRequirements.isRequired,
    })
    .from(serviceRequirements)
    .where(eq(serviceRequirements.serviceId, serviceId))
    .orderBy(asc(serviceRequirements.sortOrder), asc(serviceRequirements.label));
}

type UploadInput = {
  requestId: string;
  requirementId?: string | null;
  fileName: string;
  bytes: Uint8Array;
  bucket: string;
};

// Steps c to i of the upload flow in docs/ARCHITECTURE.md section 6. The caller has ALREADY checked
// access (requireRequestAccess) and the rate limit.
export async function uploadFile(db: AppDb, storage: StorageDriver, input: UploadInput) {
  const limits = await getUploadLimits(db);

  if (input.bytes.byteLength === 0) throw new UploadError("empty");
  if (input.bytes.byteLength > limits.maxBytes) {
    throw new UploadError(
      "too-big",
      `That file is too big. The most we accept is ${limits.maxBytes / 1024 / 1024} MB.`,
    );
  }

  // The REAL type, from the first bytes. Never trust the name or the type the browser says.
  const type = detectFileType(input.bytes);
  if (!type) throw new UploadError("bad-type");

  const [request] = await db
    .select({ serviceId: requests.serviceId })
    .from(requests)
    .where(eq(requests.id, input.requestId))
    .limit(1);
  if (!request) throw new UploadError("not-draft");

  if (input.requirementId) {
    const [item] = await db
      .select({ id: serviceRequirements.id })
      .from(serviceRequirements)
      .where(
        and(
          eq(serviceRequirements.id, input.requirementId),
          eq(serviceRequirements.serviceId, request.serviceId),
        ),
      )
      .limit(1);
    if (!item) throw new UploadError("bad-requirement");
  }

  const existing = await listFiles(db, input.requestId);
  if (existing.length >= limits.maxFiles) throw new UploadError("too-many");

  const used = await storageUsedBytes(db);
  if (used + input.bytes.byteLength >= (STORAGE_LIMIT_BYTES * STORAGE_STOP_PERCENT) / 100) {
    throw new UploadError("storage-full");
  }

  // A random path. The original name is never part of it.
  const storagePath = `requests/${input.requestId}/${randomUUID()}.${type.ext}`;
  await storage.put(input.bucket, storagePath, input.bytes, type.mime);

  try {
    const [row] = await db
      .insert(requestFiles)
      .values({
        requestId: input.requestId,
        requirementId: input.requirementId ?? null,
        storagePath,
        originalName: cleanFileName(input.fileName),
        mimeType: type.mime,
        sizeBytes: input.bytes.byteLength,
      })
      .returning({
        id: requestFiles.id,
        originalName: requestFiles.originalName,
        sizeBytes: requestFiles.sizeBytes,
        requirementId: requestFiles.requirementId,
      });
    return row;
  } catch (error) {
    // Do not leave a file in storage that the database does not know about.
    await storage.remove(input.bucket, [storagePath]).catch(() => {});
    throw error;
  }
}

// Draft only (the caller checks access). Removes the file from storage and the database.
export async function removeFile(
  db: AppDb,
  storage: StorageDriver,
  input: { requestId: string; fileId: string; bucket: string },
) {
  const [file] = await db
    .select({ id: requestFiles.id, storagePath: requestFiles.storagePath })
    .from(requestFiles)
    .where(and(eq(requestFiles.id, input.fileId), eq(requestFiles.requestId, input.requestId)))
    .limit(1);
  if (!file) return false;
  await storage.remove(input.bucket, [file.storagePath]);
  await db.delete(requestFiles).where(eq(requestFiles.id, file.id));
  return true;
}
