import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { PanelAuthError } from "@/server/auth/panel-core";
import { requirePanel } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { getFileLink } from "@/server/services/admin-requests";
import { CLIENT_FILES_BUCKET, getStorage } from "@/server/storage/storage";

// GET /api/admin/file?id=<file id>
// Admin only. Writes "file.opened" to the activity log, then sends the admin to a link that works for
// 60 seconds. The file opens in the admin's own browser viewer. It is never shown inside our pages.
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requirePanel("requests.open_file");
  } catch (error) {
    if (error instanceof PanelAuthError) return new NextResponse("Not allowed", { status: 403 });
    throw error;
  }
  const fileId = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return new NextResponse("Not found", { status: 404 });

  const ipHash = hashIp(readClientIp(await headers()));
  const link = await getFileLink(getDb(), getStorage(), admin, {
    fileId,
    bucket: CLIENT_FILES_BUCKET(),
    ipHash,
  });
  if (!link) return new NextResponse("Not found", { status: 404 });
  // A local development link is a path on this site. A Supabase link is a full address.
  return NextResponse.redirect(new URL(link, request.url), {
    headers: { "cache-control": "no-store" },
  });
}
