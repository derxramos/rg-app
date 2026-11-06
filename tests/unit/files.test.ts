import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestDetailsSchema } from "@/lib/validation/request";
import { requestFiles, serviceRequirements, services, siteSettings } from "@/server/db/schema";
import { createDraft } from "@/server/services/requests";
import {
  getUploadLimits,
  listFiles,
  removeFile,
  storageUsedBytes,
  uploadFile,
  UploadError,
} from "@/server/services/files";
import type { StorageDriver } from "@/server/storage/types";

import { createTestDb } from "../helpers/test-db";

// A fake storage that keeps files in memory.
function fakeStorage() {
  const files = new Map<string, Uint8Array>();
  const driver: StorageDriver = {
    async put(bucket, path, bytes) {
      files.set(`${bucket}/${path}`, bytes);
    },
    async remove(bucket, paths) {
      for (const p of paths) files.delete(`${bucket}/${p}`);
    },
    async signedUrl(bucket, path) {
      return `signed://${bucket}/${path}`;
    },
  };
  return { files, driver };
}

const JPG = (size = 100) => Uint8Array.from([0xff, 0xd8, 0xff, ...new Array(size).fill(1)]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.4 sample");

let t: Awaited<ReturnType<typeof createTestDb>>;
let requirementId: string;
let otherRequirementId: string;

async function newRequest() {
  const draft = await createDraft(
    t.db,
    requestDetailsSchema.parse({
      serviceSlug: "svc",
      fullName: "Test",
      email: "zolb-test+f@example.com",
      phone: "9171234567",
      consent: true,
    }),
    { consentVersion: "v1", secret: "s" },
  );
  return draft.requestId;
}

beforeAll(async () => {
  t = await createTestDb();
  const [svc] = await t.db.insert(services).values({ slug: "svc", name: "Service" }).returning();
  const [other] = await t.db.insert(services).values({ slug: "svc2", name: "Other" }).returning();
  [{ id: requirementId }] = await t.db
    .insert(serviceRequirements)
    .values({ serviceId: svc.id, label: "Requirement 1" })
    .returning();
  [{ id: otherRequirementId }] = await t.db
    .insert(serviceRequirements)
    .values({ serviceId: other.id, label: "Requirement X" })
    .returning();
}, 60_000);
afterAll(async () => t.close());

describe("uploadFile", () => {
  it("stores a JPG with a random path and keeps the clean original name in the database", async () => {
    const id = await newRequest();
    const s = fakeStorage();
    const row = await uploadFile(t.db, s.driver, {
      requestId: id,
      requirementId,
      fileName: "..\\my id photo.jpg",
      bytes: JPG(),
      bucket: "client-files",
    });
    expect(row.originalName).toBe("my id photo.jpg");

    const [saved] = await t.db.select().from(requestFiles).where(eq(requestFiles.id, row.id));
    expect(saved.storagePath).toMatch(new RegExp(`^requests/${id}/[0-9a-f-]{36}\\.jpg$`));
    expect(saved.storagePath).not.toContain("photo");
    expect(saved.mimeType).toBe("image/jpeg");
    expect(s.files.has(`client-files/${saved.storagePath}`)).toBe(true);
  });

  it("uses the real type, not the name: an .exe renamed to .jpg is refused and nothing is saved", async () => {
    const id = await newRequest();
    const s = fakeStorage();
    await expect(
      uploadFile(t.db, s.driver, {
        requestId: id,
        fileName: "photo.jpg",
        bytes: new TextEncoder().encode("MZ this is a program"),
        bucket: "client-files",
      }),
    ).rejects.toMatchObject({ code: "bad-type" });
    expect(s.files.size).toBe(0);
    expect(await listFiles(t.db, id)).toHaveLength(0);
  });

  it("saves a file whose name says .txt but whose bytes are a PNG as a png", async () => {
    const id = await newRequest();
    const s = fakeStorage();
    const row = await uploadFile(t.db, s.driver, {
      requestId: id,
      fileName: "note.txt",
      bytes: PNG,
      bucket: "b",
    });
    const [saved] = await t.db.select().from(requestFiles).where(eq(requestFiles.id, row.id));
    expect(saved.mimeType).toBe("image/png");
    expect(saved.storagePath.endsWith(".png")).toBe(true);
  });

  it("refuses empty files and files over the size setting", async () => {
    const id = await newRequest();
    const s = fakeStorage();
    await expect(
      uploadFile(t.db, s.driver, {
        requestId: id,
        fileName: "a.jpg",
        bytes: new Uint8Array(),
        bucket: "b",
      }),
    ).rejects.toMatchObject({ code: "empty" });
    const limits = await getUploadLimits(t.db);
    expect(limits.maxBytes).toBe(3 * 1024 * 1024);
    await expect(
      uploadFile(t.db, s.driver, {
        requestId: id,
        fileName: "a.jpg",
        bytes: JPG(limits.maxBytes),
        bucket: "b",
      }),
    ).rejects.toMatchObject({ code: "too-big" });
  });

  it("follows the max file size setting", async () => {
    await t.db.insert(siteSettings).values({ key: "max_file_size_mb", value: 1 });
    expect((await getUploadLimits(t.db)).maxBytes).toBe(1024 * 1024);
    await t.db.delete(siteSettings).where(eq(siteSettings.key, "max_file_size_mb"));
  });

  it("stops at the maximum number of files per request", async () => {
    await t.db.insert(siteSettings).values({ key: "max_files_per_request", value: 2 });
    const id = await newRequest();
    const s = fakeStorage();
    for (let i = 0; i < 2; i++)
      await uploadFile(t.db, s.driver, {
        requestId: id,
        fileName: `f${i}.pdf`,
        bytes: PDF,
        bucket: "b",
      });
    await expect(
      uploadFile(t.db, s.driver, { requestId: id, fileName: "f3.pdf", bytes: PDF, bucket: "b" }),
    ).rejects.toMatchObject({ code: "too-many" });
    await t.db.delete(siteSettings).where(eq(siteSettings.key, "max_files_per_request"));
  });

  it("refuses a checklist item that belongs to another service", async () => {
    const id = await newRequest();
    await expect(
      uploadFile(t.db, fakeStorage().driver, {
        requestId: id,
        requirementId: otherRequirementId,
        fileName: "a.pdf",
        bytes: PDF,
        bucket: "b",
      }),
    ).rejects.toMatchObject({ code: "bad-requirement" });
  });

  it("stops new uploads when storage is almost full", async () => {
    const id = await newRequest();
    // Pretend a huge file already exists (a row only, no real data).
    await t.db.insert(requestFiles).values({
      requestId: id,
      storagePath: "requests/x/huge.pdf",
      originalName: "huge.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1_030_000_000,
    });
    expect(await storageUsedBytes(t.db)).toBeGreaterThanOrEqual(1_030_000_000);
    const err = await uploadFile(t.db, fakeStorage().driver, {
      requestId: id,
      fileName: "a.pdf",
      bytes: PDF,
      bucket: "b",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.code).toBe("storage-full");
    await t.db.delete(requestFiles).where(eq(requestFiles.storagePath, "requests/x/huge.pdf"));
  });

  it("removes a file from storage and the database, only for its own request", async () => {
    const id = await newRequest();
    const other = await newRequest();
    const s = fakeStorage();
    const row = await uploadFile(t.db, s.driver, {
      requestId: id,
      fileName: "a.pdf",
      bytes: PDF,
      bucket: "b",
    });
    expect(
      await removeFile(t.db, s.driver, { requestId: other, fileId: row.id, bucket: "b" }),
    ).toBe(false);
    expect(s.files.size).toBe(1);
    expect(await removeFile(t.db, s.driver, { requestId: id, fileId: row.id, bucket: "b" })).toBe(
      true,
    );
    expect(s.files.size).toBe(0);
    expect(await listFiles(t.db, id)).toHaveLength(0);
  });
});
