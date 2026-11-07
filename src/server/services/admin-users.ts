import "server-only";

// Admin users (owner only, fresh 2FA). docs/FEATURES.md A9.
import { asc, eq } from "drizzle-orm";

import {
  AdminAuthError,
  OWNER_ONLY,
  hasRole,
  type AdminProfile,
  type AdminRole,
} from "@/server/auth/admin-core";
import { activityLog, adminProfiles, profiles } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

// What we need from Supabase Auth. A fake is used in tests.
export interface AuthAdminApi {
  // Creates the login and sends the invite email. Returns the new user id.
  invite(email: string): Promise<{ id: string }>;
}

export class UserAdminError extends Error {
  constructor(
    public code: "invalid" | "exists" | "last-owner" | "not-found" | "self",
    message: string,
  ) {
    super(message);
  }
}

export async function listAdmins(db: AppDb) {
  return db.select().from(adminProfiles).orderBy(asc(adminProfiles.fullName));
}

function guard(actor: AdminProfile, fresh2fa: boolean) {
  if (!hasRole(actor, OWNER_ONLY)) throw new AdminAuthError("wrong-role");
  if (!fresh2fa) throw new AdminAuthError("needs-fresh-2fa");
}

export async function inviteAdmin(
  db: AppDb,
  actor: AdminProfile,
  api: AuthAdminApi,
  input: { email: string; fullName: string; role: AdminRole },
  context: { fresh2fa: boolean; ipHash?: string | null },
) {
  guard(actor, context.fresh2fa);
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    throw new UserAdminError("invalid", "Please enter a full email address.");
  if (fullName.length < 2 || fullName.length > 100)
    throw new UserAdminError("invalid", "Please enter the full name.");
  if (!["owner", "staff"].includes(input.role))
    throw new UserAdminError("invalid", "Unknown role.");

  const [existing] = await db
    .select({ id: adminProfiles.id })
    .from(adminProfiles)
    .where(eq(adminProfiles.email, email))
    .limit(1);
  if (existing) throw new UserAdminError("exists", "That email is already an admin.");

  const { id } = await api.invite(email);
  await db.transaction(async (tx) => {
    await tx.insert(adminProfiles).values({ id, fullName, email, role: input.role });
    // The account role must also say "admin" (requireAdmin checks both). The sign-up trigger already
    // made a "user" profile for the new login, so this upsert changes it.
    await tx
      .insert(profiles)
      .values({ id, email, fullName, role: "admin" })
      .onConflictDoUpdate({ target: profiles.id, set: { role: "admin", fullName } });
    await tx.insert(activityLog).values({
      actorType: "admin",
      actorId: actor.id,
      action: "admin.invited",
      entityType: "admin",
      entityId: id,
      details: { role: input.role },
      ipHash: context.ipHash ?? null,
    });
  });
  return id;
}

// Role change or turn on/off. The database also refuses to remove the last active owner.
export async function updateAdmin(
  db: AppDb,
  actor: AdminProfile,
  input: { adminId: string; role?: AdminRole; isActive?: boolean },
  context: { fresh2fa: boolean; ipHash?: string | null },
) {
  guard(actor, context.fresh2fa);
  if (
    input.adminId === actor.id &&
    (input.isActive === false || (input.role && input.role !== actor.role))
  ) {
    throw new UserAdminError(
      "self",
      "You cannot turn off or demote your own account. Ask another owner.",
    );
  }
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(adminProfiles)
        .where(eq(adminProfiles.id, input.adminId))
        .limit(1);
      if (!before) throw new UserAdminError("not-found", "Admin not found.");
      await tx
        .update(adminProfiles)
        .set({
          ...(input.role ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        })
        .where(eq(adminProfiles.id, input.adminId));
      await tx.insert(activityLog).values({
        actorType: "admin",
        actorId: actor.id,
        action: "admin.updated",
        entityType: "admin",
        entityId: input.adminId,
        details: {
          before: { role: before.role, isActive: before.isActive },
          after: { role: input.role ?? before.role, isActive: input.isActive ?? before.isActive },
        },
        ipHash: context.ipHash ?? null,
      });
    });
  } catch (error) {
    if (
      (error as { code?: string; cause?: { code?: string } }).code === "23514" ||
      (error as { cause?: { code?: string } }).cause?.code === "23514"
    ) {
      throw new UserAdminError("last-owner", "There must always be at least one active owner.");
    }
    throw error;
  }
}
