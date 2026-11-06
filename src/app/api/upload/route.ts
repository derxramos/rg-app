import { NextResponse } from "next/server";

import { AccessError } from "@/server/auth/request-access-core";
import { requireRequestAccess } from "@/server/auth/request-access";
import { getDb } from "@/server/db/client";
import { readClientIp, hashIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";
import { getUploadLimits, uploadFile, UploadError } from "@/server/services/files";
import { CLIENT_FILES_BUCKET, getStorage } from "@/server/storage/storage";

// POST /api/upload  (multipart form: requestId, requirementId (optional), file)
// ONE file per call. Order of checks follows docs/ARCHITECTURE.md section 6.

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  const db = getDb();

  // Refuse a very big body before reading it. The real size limit is checked again below.
  const limits = await getUploadLimits(db);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limits.maxBytes + 1024 * 1024) {
    return json({ ok: false, error: "That file is too big." }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "We could not read that upload." }, 400);
  }

  const requestId = String(form.get("requestId") ?? "");
  const requirementValue = form.get("requirementId");
  const requirementId =
    typeof requirementValue === "string" && requirementValue ? requirementValue : null;
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "No file was sent." }, 400);

  // a. access: the draft cookie (or the tracking session when the status is Waiting for client)
  try {
    await requireRequestAccess(requestId, "upload");
  } catch (error) {
    if (error instanceof AccessError) {
      return json({ ok: false, error: "You cannot add files to this request." }, 403);
    }
    throw error;
  }

  // b. rate limits: per visitor and per request
  const ipHash = hashIp(readClientIp(request.headers));
  const [byIp, byRequest] = await Promise.all([
    rateLimit(db, { key: `upload:ip:${ipHash}`, limit: 60, windowSeconds: 3600 }),
    rateLimit(db, { key: `upload:req:${requestId}`, limit: 40, windowSeconds: 3600 }),
  ]);
  if (!byIp.allowed || !byRequest.allowed) {
    return json({ ok: false, error: "Too many uploads. Please wait a little and try again." }, 429);
  }

  // c to i: size, real type, count, storage cap, random path, storage, database row
  try {
    const saved = await uploadFile(db, getStorage(), {
      requestId,
      requirementId,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      bucket: CLIENT_FILES_BUCKET(),
    });
    return json({ ok: true, file: saved });
  } catch (error) {
    if (error instanceof UploadError) {
      const status = error.code === "too-big" ? 413 : error.code === "bad-type" ? 415 : 400;
      return json({ ok: false, code: error.code, error: error.message }, status);
    }
    console.error("Upload failed:", error);
    return json({ ok: false, error: "We could not save that file. Please try again." }, 500);
  }
}
