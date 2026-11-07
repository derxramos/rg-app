import "server-only";

// Admin users (owner only, fresh 2FA). docs/FEATURES.md A9.
import { asc, eq, ilike, or } from "drizzle-orm";

import { passwordProblem } from "@/lib/validation/auth";
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

// For making a login with a temporary password. A fake is used in tests.
export interface AuthPasswordApi {
  // Creates a login that is already verified. Returns the new user id.
  createWithPassword(input: {
    email: string;
    password: string;
    fullName: string;
  }): Promise<{ id: string }>;
  // Removes a login again (used to clean up when a later step fails).
  remove(userId: string): Promise<void>;
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

// Makes an EXISTING account (someone who already created an account) an admin. OWNER ONLY, fresh 2FA, logged.
// The account role (profiles.role) and the admin record (admin_profiles) are both set in one transaction.
export async function promoteToAdmin(
  db: AppDb,
  actor: AdminProfile,
  input: { email: string; role: AdminRole },
  context: { fresh2fa: boolean; ipHash?: string | null },
) {
  guard(actor, context.fresh2fa);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    throw new UserAdminError("invalid", "Please enter a full email address.");
  if (!["owner", "staff"].includes(input.role))
    throw new UserAdminError("invalid", "Unknown role.");

  const [account] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  if (!account)
    throw new UserAdminError(
      "not-found",
      "There is no account with that email. The person must create an account first.",
    );
  const [existing] = await db
    .select({ isActive: adminProfiles.isActive })
    .from(adminProfiles)
    .where(eq(adminProfiles.id, account.id))
    .limit(1);
  if (existing?.isActive && account.role === "admin")
    throw new UserAdminError("exists", "That person is already an admin.");

  await db.transaction(async (tx) => {
    // Only the database owner (our server) may change a role. The database refuses it for users.
    await tx.update(profiles).set({ role: "admin" }).where(eq(profiles.id, account.id));
    await tx
      .insert(adminProfiles)
      .values({
        id: account.id,
        fullName: account.fullName || email,
        email,
        role: input.role,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: adminProfiles.id,
        set: { role: input.role, isActive: true },
      });
    await tx.insert(activityLog).values({
      actorType: "admin",
      actorId: actor.id,
      action: "role.changed",
      entityType: "admin",
      entityId: account.id,
      details: { from: account.role, to: "admin", level: input.role },
      ipHash: context.ipHash ?? null,
    });
  });
  return account.id;
}

// Takes the admin role away: the account becomes a normal user again, and the admin record is switched off
// (it stays, because past notes and payment checks point to it). OWNER ONLY, fresh 2FA, logged.
export async function removeAdmin(
  db: AppDb,
  actor: AdminProfile,
  input: { adminId: string },
  context: { fresh2fa: boolean; ipHash?: string | null },
) {
  guard(actor, context.fresh2fa);
  if (input.adminId === actor.id)
    throw new UserAdminError("self", "You cannot remove your own admin role. Ask another owner.");
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(adminProfiles)
        .where(eq(adminProfiles.id, input.adminId))
        .limit(1);
      if (!before) throw new UserAdminError("not-found", "Admin not found.");
      // The database refuses this when it would remove the last active owner.
      await tx
        .update(adminProfiles)
        .set({ isActive: false })
        .where(eq(adminProfiles.id, input.adminId));
      await tx.update(profiles).set({ role: "user" }).where(eq(profiles.id, input.adminId));
      await tx.insert(activityLog).values({
        actorType: "admin",
        actorId: actor.id,
        action: "role.changed",
        entityType: "admin",
        entityId: input.adminId,
        details: { from: "admin", to: "user", level: before.role },
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
      // Turning someone back on also gives the account role "admin" back (it may have been removed).
      if (input.isActive === true) {
        await tx.update(profiles).set({ role: "admin" }).where(eq(profiles.id, input.adminId));
      }
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

// ---------- All accounts: the "Existing accounts" list ----------

export type AccountRow = {
  id: string;
  email: string;
  fullName: string;
  role: "user" | "admin";
  // Only for admins: "owner" or "staff", and whether the admin record is on.
  level: AdminRole | null;
  isActive: boolean | null;
  mustChangePassword: boolean;
};

export const ACCOUNT_LIST_LIMIT = 50;

// Every account (users and admins), in email order. `search` matches part of the email or the name.
// Only the first 50 are returned, so the page stays fast. Use the search box to find someone else.
export async function listAccounts(db: AppDb, search?: string): Promise<AccountRow[]> {
  // % and _ and \ have a special meaning in LIKE, so they are escaped.
  const term = (search ?? "")
    .trim()
    .slice(0, 100)
    .replace(/[%_\\]/g, (char) => `\\${char}`);
  return db
    .select({
      id: profiles.id,
      email: profiles.email,
      fullName: profiles.fullName,
      role: profiles.role,
      mustChangePassword: profiles.mustChangePassword,
      level: adminProfiles.role,
      isActive: adminProfiles.isActive,
    })
    .from(profiles)
    .leftJoin(adminProfiles, eq(adminProfiles.id, profiles.id))
    .where(
      term
        ? or(ilike(profiles.email, `%${term}%`), ilike(profiles.fullName, `%${term}%`))
        : undefined,
    )
    .orderBy(asc(profiles.email))
    .limit(ACCOUNT_LIST_LIMIT);
}

// The dropdown on "Existing accounts": User or Admin. OWNER ONLY, fresh 2FA, logged (by the two functions it calls).
// "Admin" keeps the old level (owner or staff) when the person was an admin before. A new admin is "staff".
// The level can be changed in the admin list above the form.
export async function setAccountRole(
  db: AppDb,
  actor: AdminProfile,
  input: { accountId: string; role: "user" | "admin" },
  context: { fresh2fa: boolean; ipHash?: string | null },
): Promise<"changed" | "same"> {
  guard(actor, context.fresh2fa);
  if (!["user", "admin"].includes(input.role)) throw new UserAdminError("invalid", "Unknown role.");
  const [account] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, input.accountId))
    .limit(1);
  if (!account) throw new UserAdminError("not-found", "Account not found.");
  if (account.role === input.role) return "same";
  if (input.accountId === actor.id)
    throw new UserAdminError("self", "You cannot change your own role. Ask another owner.");

  if (input.role === "user") {
    await removeAdmin(db, actor, { adminId: input.accountId }, context);
    return "changed";
  }
  const [previous] = await db
    .select({ role: adminProfiles.role })
    .from(adminProfiles)
    .where(eq(adminProfiles.id, input.accountId))
    .limit(1);
  await promoteToAdmin(
    db,
    actor,
    { email: account.email, role: previous?.role ?? "staff" },
    context,
  );
  return "changed";
}

// ---------- A new admin with a temporary password ----------

// Makes a login that is already verified, with a temporary password the owner chose, and makes it an admin.
// The person MUST choose their own password at the first sign in (profiles.must_change_password).
// We never save or log the temporary password. OWNER ONLY and a fresh 2FA code.
export async function createAdminWithPassword(
  db: AppDb,
  actor: AdminProfile,
  api: AuthPasswordApi,
  input: { email: string; fullName: string; role: AdminRole; temporaryPassword: string },
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
  const problem = passwordProblem(input.temporaryPassword, email);
  if (problem) throw new UserAdminError("invalid", `Temporary password: ${problem}`);

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);
  if (existing)
    throw new UserAdminError(
      "exists",
      "That email already has an account. Find it under Existing accounts and set it to Admin.",
    );

  const { id } = await api.createWithPassword({
    email,
    password: input.temporaryPassword,
    fullName,
  });
  try {
    await db.transaction(async (tx) => {
      await tx.insert(adminProfiles).values({ id, fullName, email, role: input.role });
      // The sign-up trigger already made a "user" profile for the new login, so this upsert changes it.
      await tx
        .insert(profiles)
        .values({ id, email, fullName, role: "admin", mustChangePassword: true })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { role: "admin", fullName, mustChangePassword: true },
        });
      await tx.insert(activityLog).values({
        actorType: "admin",
        actorId: actor.id,
        action: "admin.created",
        entityType: "admin",
        entityId: id,
        // The password is never written here.
        details: { role: input.role, method: "temporary-password" },
        ipHash: context.ipHash ?? null,
      });
    });
  } catch (error) {
    // Do not leave a login with no admin record behind.
    await api.remove(id).catch(() => {});
    throw error;
  }
  return id;
}
