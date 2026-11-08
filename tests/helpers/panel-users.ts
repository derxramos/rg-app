// Test helper: makes accounts in the profiles table (one role column) and gives them back as the
// "acting person" that the admin service functions take.
import { profiles } from "@/server/db/schema";
import type { PanelRole } from "@/lib/permissions";
import type { PanelUser } from "@/server/auth/panel-core";
import type { AppDb } from "@/server/db/types";

export type PanelUserInput = {
  id: string;
  fullName: string;
  email: string;
  role: PanelRole;
  isActive?: boolean;
};

export async function insertPanelUsers(db: AppDb, rows: PanelUserInput[]): Promise<PanelUser[]> {
  await db.insert(profiles).values(
    rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      role: row.role,
      isActive: row.isActive ?? true,
    })),
  );
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    isActive: row.isActive ?? true,
  }));
}
