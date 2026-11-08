import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { PanelAuthError } from "@/server/auth/panel-core";
import { requirePanel } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { exportCsv } from "@/server/services/admin-overview";

// GET /api/admin/export?type=requests|payments&from=YYYY-MM-DD&to=YYYY-MM-DD
// Owner only. Every export is written to the activity log. Formulas in cells are made safe (csv.ts).
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requirePanel("export.csv");
  } catch (error) {
    if (error instanceof PanelAuthError) return new NextResponse("Not allowed", { status: 403 });
    throw error;
  }
  const params = new URL(request.url).searchParams;
  const type = params.get("type") === "payments" ? "payments" : "requests";
  const date = (name: string) => {
    const value = params.get(name) ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  };

  const csv = await exportCsv(getDb(), admin, {
    type,
    from: date("from"),
    to: date("to"),
    ipHash: hashIp(readClientIp(await headers())),
  });
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rg-${type}.csv"`,
      "cache-control": "no-store",
    },
  });
}
