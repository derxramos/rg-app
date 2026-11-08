import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { PanelAuthError } from "@/server/auth/panel-core";
import { requirePanel } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { exportActivityCsv } from "@/server/services/admin-overview";

// GET /api/admin/activity-export?days=90|180|365
// Owner and admin only (the same permission as the clean-up). The entries older than that many days, as a CSV file,
// so a copy can be kept before they are cleaned up. The download is written to the activity log.
// Formulas in cells are made safe (csv.ts).
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requirePanel("activity.purge");
  } catch (error) {
    if (error instanceof PanelAuthError) return new NextResponse("Not allowed", { status: 403 });
    throw error;
  }
  const days = Number(new URL(request.url).searchParams.get("days"));
  let csv: string;
  try {
    csv = await exportActivityCsv(getDb(), admin, {
      olderThanDays: days,
      ipHash: hashIp(readClientIp(await headers())),
    });
  } catch (error) {
    if ((error as { code?: string }).code === "invalid")
      return new NextResponse("Choose 90, 180 or 365 days.", { status: 400 });
    throw error;
  }
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rg-activity-older-than-${days}-days.csv"`,
      "cache-control": "no-store",
    },
  });
}
