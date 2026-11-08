import "server-only";

// Accounts: the table in Settings > Admin users, invites, role changes, turn off / on.
// Who may do what is in src/lib/permissions.ts. Rules that need more than the table (checked here, and again
// by database triggers):
//   - nobody changes, turns off or resets their own account
//   - only an owner may invite, promote, demote or turn off an owner
//   - there is always at least one active owner (database trigger, code 23514)
// Every change needs a fresh confirm (the actor's own code or password) and is written to activity_log.

import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { can, isPanelRole, type PanelRole, type Role } from "@/lib/permissions";
import { passwordProblem } from "@/lib/validation/auth";
import {
  DEFAULT_PAGE_SIZE,
  type AccountQuery,
  type AccountStatus,
} from "@/lib/validation/accounts";
import { PanelAuthError, assertCan, type PanelUser } from "@/server/auth/panel-core";
import { setActor } from "@/server/db/actor";
import { activityLog, profiles } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

// What we need from Supabase Auth. A fake is used in tests.
export interface AuthAdminApi {
  // Creates the login and sends the invite email. Returns the new user id.
  invite(email: string): Promise<{ id: string }>;
  // Sends the invitation (or the confirmation link) again.
  resendInvite(email: string): Promise<void>;
  // Blocks (or allows) sign in at Supabase itself. Used for "Turn off" and "Turn on".
  setBanned(userId: string, banned: boolean): Promise<void>;
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

export class AccountError extends Error {
  constructor(
    public code: "invalid" | "exists" | "last-owner" | "not-found" | "self" | "owner-only",
    message: string,
  ) {
    super(message);
  }
}

export type AccountContext = { fresh2fa: boolean; ipHash?: string | null };
type Db = AppDb;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RANK: Record<Role, number> = { user: 0, staff: 1, admin: 2, owner: 3 };

function requireStepUp(context: AccountContext) {
  if (!context.fresh2fa) throw new PanelAuthError("needs-fresh-2fa");
}

// Only an owner may touch an owner, or make someone an owner.
function guardOwnerTouch(actor: PanelUser, ...roles: Role[]) {
  if (roles.includes("owner")) {
    if (!can(actor.role, "accounts.manage_owner"))
      throw new AccountError(
        "owner-only",
        "Only an owner can invite, change or turn off an owner.",
      );
  }
}

function isLastOwnerError(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23514" || e?.cause?.code === "23514";
}

async function getAccount(db: Db, id: string) {
  const [account] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!account) throw new AccountError("not-found", "Account not found.");
  return account;
}

type LogEntry = {
  action: string;
  entityId: string;
  details: Record<string, unknown>;
  ipHash?: string | null;
};
async function log(tx: Pick<Db, "insert">, actor: PanelUser, entry: LogEntry) {
  await tx.insert(activityLog).values({
    actorType: "admin",
    actorId: actor.id,
    action: entry.action,
    entityType: "account",
    entityId: entry.entityId,
    details: entry.details,
    ipHash: entry.ipHash ?? null,
  });
}

// Everyone who can open the admin area (for the "who did it" filter on the activity page).
export async function listPanelPeople(db: Db) {
  return db
    .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email })
    .from(profiles)
    .where(inArray(profiles.role, ["staff", "admin", "owner"]))
    .orderBy(asc(profiles.fullName));
}

// ---------- The table ----------

export type AccountRow = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  status: AccountStatus;
  // true / false for panel roles, null for clients (they have no 2-step login).
  twoFactor: boolean | null;
};

// postgres-js returns the rows as an array, PGlite as { rows }. Handle both.
function rowsOf(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[];
}

async function hasAuthSchema(db: Db): Promise<boolean> {
  const result = await db.execute(sql`select to_regclass('auth.users') is not null as found`);
  return Boolean(rowsOf(result)[0]?.found);
}

// Who has an unverified email, and who has a verified authenticator? Read-only, from the auth schema.
async function readAuthInfo(db: Db, ids: string[]) {
  const unverified = new Set<string>();
  const withFactor = new Set<string>();
  if (ids.length === 0 || !(await hasAuthSchema(db)))
    return { unverified, withFactor, known: false };
  const list = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const users = rowsOf(
    await db.execute(
      sql`select id from auth.users where email_confirmed_at is null and id in (${list})`,
    ),
  );
  for (const row of users) unverified.add(String(row.id));
  try {
    const factors = rowsOf(
      await db.execute(
        sql`select distinct user_id from auth.mfa_factors where status = 'verified' and user_id in (${list})`,
      ),
    );
    for (const row of factors) withFactor.add(String(row.user_id));
  } catch {
    // A database without the factors table: show "Off".
  }
  return { unverified, withFactor, known: true };
}

function statusOf(
  account: { isActive: boolean; mustChangePassword: boolean },
  unverified: boolean,
): AccountStatus {
  if (!account.isActive) return "turned_off";
  if (account.mustChangePassword) return "invited";
  if (unverified) return "unverified";
  return "active";
}

// One page of accounts. Search, filters and paging all happen in the database.
export async function listAccounts(
  db: Db,
  query: Partial<AccountQuery> = {},
): Promise<{ rows: AccountRow[]; total: number; page: number; perPage: number }> {
  const perPage = query.perPage ?? DEFAULT_PAGE_SIZE;
  const authSchema = await hasAuthSchema(db);

  // % and _ and \ have a special meaning in LIKE, so they are escaped.
  const term = (query.q ?? "")
    .trim()
    .slice(0, 100)
    .replace(/[%_\\]/g, (char) => `\\${char}`);

  const unverifiedSql = sql`exists (select 1 from auth.users u where u.id = ${profiles.id} and u.email_confirmed_at is null)`;
  const conditions: (SQL | undefined)[] = [
    term
      ? or(ilike(profiles.email, `%${term}%`), ilike(profiles.fullName, `%${term}%`))
      : undefined,
    query.role ? eq(profiles.role, query.role) : undefined,
  ];
  switch (query.status) {
    case "turned_off":
      conditions.push(eq(profiles.isActive, false));
      break;
    case "invited":
      conditions.push(eq(profiles.isActive, true), eq(profiles.mustChangePassword, true));
      break;
    case "unverified":
      conditions.push(
        eq(profiles.isActive, true),
        eq(profiles.mustChangePassword, false),
        authSchema ? unverifiedSql : sql`false`,
      );
      break;
    case "active":
      conditions.push(
        eq(profiles.isActive, true),
        eq(profiles.mustChangePassword, false),
        authSchema ? sql`not ${unverifiedSql}` : undefined,
      );
      break;
  }
  const where = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(profiles).where(where);
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, query.page ?? 1), lastPage);

  const found = await db
    .select()
    .from(profiles)
    .where(where)
    .orderBy(asc(profiles.email))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const info = await readAuthInfo(
    db,
    found.map((row) => row.id),
  );
  const rows: AccountRow[] = found.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    status: statusOf(row, info.unverified.has(row.id)),
    twoFactor: isPanelRole(row.role) ? info.withFactor.has(row.id) : null,
  }));
  return { rows, total, page, perPage };
}

// ---------- Invite and create ----------

type NewAccount = { email: string; fullName: string; role: PanelRole };

function cleanNewAccount(input: NewAccount) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!EMAIL.test(email) || email.length > 200)
    throw new AccountError("invalid", "Please enter a full email address.");
  if (fullName.length < 2 || fullName.length > 100)
    throw new AccountError("invalid", "Please enter the full name.");
  if (!isPanelRole(input.role)) throw new AccountError("invalid", "Unknown role.");
  return { email, fullName, role: input.role };
}

// Sends the Supabase invitation email. The person sets a password with "Forgot your password?".
export async function inviteAccount(
  db: Db,
  actor: PanelUser,
  api: AuthAdminApi,
  input: NewAccount,
  context: AccountContext,
) {
  assertCan(actor, "accounts.invite");
  requireStepUp(context);
  const clean = cleanNewAccount(input);
  guardOwnerTouch(actor, clean.role);

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, clean.email))
    .limit(1);
  if (existing)
    throw new AccountError(
      "exists",
      "That email already has an account. Use Change role in the table.",
    );

  const { id } = await api.invite(clean.email);
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    // The sign-up trigger already made a "user" profile for the new login, so this upsert changes it.
    await tx
      .insert(profiles)
      .values({ id, email: clean.email, fullName: clean.fullName, role: clean.role })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { role: clean.role, fullName: clean.fullName, isActive: true },
      });
    await log(tx, actor, {
      action: "account.invited",
      entityId: id,
      details: { email: clean.email, role: clean.role, method: "email-invitation" },
      ipHash: context.ipHash,
    });
  });
  return id;
}

// Makes a login that is already verified, with a temporary password the actor chose.
// The person MUST choose their own password at the first sign in (profiles.must_change_password).
// We never save or log the temporary password.
export async function createAccountWithPassword(
  db: Db,
  actor: PanelUser,
  api: AuthPasswordApi,
  input: NewAccount & { temporaryPassword: string },
  context: AccountContext,
) {
  assertCan(actor, "accounts.invite");
  requireStepUp(context);
  const clean = cleanNewAccount(input);
  guardOwnerTouch(actor, clean.role);
  const problem = passwordProblem(input.temporaryPassword, clean.email);
  if (problem) throw new AccountError("invalid", `Temporary password: ${problem}`);

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, clean.email))
    .limit(1);
  if (existing)
    throw new AccountError(
      "exists",
      "That email already has an account. Use Change role in the table.",
    );

  const { id } = await api.createWithPassword({
    email: clean.email,
    password: input.temporaryPassword,
    fullName: clean.fullName,
  });
  try {
    await db.transaction(async (tx) => {
      await setActor(tx, actor.id);
      await tx
        .insert(profiles)
        .values({
          id,
          email: clean.email,
          fullName: clean.fullName,
          role: clean.role,
          mustChangePassword: true,
        })
        .onConflictDoUpdate({
          target: profiles.id,
          set: {
            role: clean.role,
            fullName: clean.fullName,
            mustChangePassword: true,
            isActive: true,
          },
        });
      await log(tx, actor, {
        action: "account.created",
        entityId: id,
        // The password is never written here.
        details: { email: clean.email, role: clean.role, method: "temporary-password" },
        ipHash: context.ipHash,
      });
    });
  } catch (error) {
    // Do not leave a login with no profile settings behind.
    await api.remove(id).catch(() => {});
    throw error;
  }
  return id;
}

// ---------- Change role ----------

export type RoleChange = {
  id: string;
  email: string;
  fullName: string;
  from: Role;
  to: Role;
};

export async function changeRole(
  db: Db,
  actor: PanelUser,
  input: { accountId: string; role: Role },
  context: AccountContext,
): Promise<RoleChange | null> {
  assertCan(actor, "accounts.change_role");
  requireStepUp(context);
  if (!(input.role in RANK)) throw new AccountError("invalid", "Unknown role.");
  if (input.accountId === actor.id)
    throw new AccountError("self", "You cannot change your own role. Ask another owner or admin.");

  const target = await getAccount(db, input.accountId);
  if (target.role === input.role) return null;
  guardOwnerTouch(actor, target.role, input.role);

  try {
    await db.transaction(async (tx) => {
      await setActor(tx, actor.id);
      await tx
        .update(profiles)
        .set({
          role: input.role,
          // A lower role is signed out at once, so an open admin page cannot be used any more.
          ...(RANK[input.role] < RANK[target.role] ? { sessionsRevokedAt: sql`now()` } : {}),
        })
        .where(eq(profiles.id, target.id));
      await log(tx, actor, {
        action: "role.changed",
        entityId: target.id,
        details: { email: target.email, from: target.role, to: input.role },
        ipHash: context.ipHash,
      });
    });
  } catch (error) {
    if (isLastOwnerError(error))
      throw new AccountError("last-owner", "There must always be at least one active owner.");
    throw error;
  }
  return {
    id: target.id,
    email: target.email,
    fullName: target.fullName,
    from: target.role,
    to: input.role,
  };
}

// ---------- Turn off / on ----------

export type ActiveChange = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
};

export async function setAccountActive(
  db: Db,
  actor: PanelUser,
  api: Pick<AuthAdminApi, "setBanned">,
  input: { accountId: string; active: boolean },
  context: AccountContext,
): Promise<ActiveChange | null> {
  assertCan(actor, "accounts.turn_off");
  requireStepUp(context);
  if (input.accountId === actor.id)
    throw new AccountError(
      "self",
      "You cannot turn off your own account. Ask another owner or admin.",
    );

  const target = await getAccount(db, input.accountId);
  if (target.isActive === input.active) return null;
  guardOwnerTouch(actor, target.role);

  try {
    await db.transaction(async (tx) => {
      await setActor(tx, actor.id);
      await tx
        .update(profiles)
        .set({
          isActive: input.active,
          // Turning off also signs the person out everywhere.
          ...(input.active ? {} : { sessionsRevokedAt: sql`now()` }),
        })
        .where(eq(profiles.id, target.id));
      await log(tx, actor, {
        action: input.active ? "account.turned_on" : "account.turned_off",
        entityId: target.id,
        details: { email: target.email, role: target.role },
        ipHash: context.ipHash,
      });
    });
  } catch (error) {
    if (isLastOwnerError(error))
      throw new AccountError("last-owner", "There must always be at least one active owner.");
    throw error;
  }
  // The database is the main check. The ban also blocks sign in at Supabase itself.
  await api.setBanned(target.id, !input.active);
  return {
    id: target.id,
    email: target.email,
    fullName: target.fullName,
    role: target.role,
    active: input.active,
  };
}

// ---------- Resend the invitation ----------

export async function resendInvite(
  db: Db,
  actor: PanelUser,
  api: Pick<AuthAdminApi, "resendInvite">,
  input: { accountId: string },
  context: AccountContext,
) {
  assertCan(actor, "accounts.resend_invite");
  requireStepUp(context);
  const target = await getAccount(db, input.accountId);
  guardOwnerTouch(actor, target.role);
  const info = await readAuthInfo(db, [target.id]);
  if (info.known && !info.unverified.has(target.id))
    throw new AccountError("invalid", "This person has already opened the invitation.");
  await api.resendInvite(target.email);
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    await log(tx, actor, {
      action: "account.invite_resent",
      entityId: target.id,
      details: { email: target.email },
      ipHash: context.ipHash,
    });
  });
  return { email: target.email };
}
