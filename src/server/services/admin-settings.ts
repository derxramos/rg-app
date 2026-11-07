import "server-only";

// Admin changes to services, checklists, site settings and payment methods.
// Roles (CLAUDE.md rule 5, docs/FEATURES.md A6 to A8):
//   - payment methods: OWNER only, and a fresh 2FA code for the risky fields (QR, account name, account number)
//   - file settings: owner only
//   - services, checklists and site content: owner and staff (assumption, see PROGRESS.md)

import { and, asc, count, eq, sql } from "drizzle-orm";

import { formatFee } from "@/lib/money";

import { slugify } from "@/lib/slug";
import { parseSetting, type SettingKey, type SettingValue } from "@/lib/validation/settings";
import { AdminAuthError, OWNER_ONLY, hasRole, type AdminProfile } from "@/server/auth/admin-core";
import {
  activityLog,
  paymentMethods,
  payments,
  servicePaymentMethods,
  serviceRequirements,
  services,
  siteSettings,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { isUniqueViolation } from "@/server/services/requests";

type Log = {
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipHash?: string | null;
};

async function log(db: Pick<AppDb, "insert">, actor: AdminProfile, entry: Log) {
  await db.insert(activityLog).values({
    actorType: "admin",
    actorId: actor.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    details: entry.details ?? {},
    ipHash: entry.ipHash ?? null,
  });
}

export class SettingsError extends Error {
  constructor(
    public code: "slug-taken" | "not-found" | "in-use" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

// ---------- Site settings ----------

const OWNER_SETTING_KEYS: readonly SettingKey[] = [
  "file_retention_days",
  "max_files_per_request",
  "max_file_size_mb",
  "storage_warning_percent",
];
const EDITABLE_SETTING_KEYS: readonly SettingKey[] = [
  "contact",
  "business_hours",
  "social_links",
  "home_texts",
  "privacy_notice_version",
  ...OWNER_SETTING_KEYS,
];

export async function saveSetting<K extends SettingKey>(
  db: AppDb,
  actor: AdminProfile,
  key: K,
  value: unknown,
  ipHash?: string | null,
): Promise<SettingValue<K>> {
  if (!EDITABLE_SETTING_KEYS.includes(key))
    throw new SettingsError("invalid", "That setting cannot be changed here.");
  if (OWNER_SETTING_KEYS.includes(key) && !hasRole(actor, OWNER_ONLY))
    throw new AdminAuthError("wrong-role");

  const parsed = parseSetting(key, value); // throws a ZodError for a bad value
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, key));
    await tx
      .insert(siteSettings)
      .values({ key, value: parsed, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: parsed, updatedBy: actor.id },
      });
    await log(tx, actor, {
      action: "settings.changed",
      entityType: "site_setting",
      entityId: key,
      details: { before: before?.value ?? null, after: parsed },
      ipHash,
    });
  });
  return parsed;
}

// ---------- Services ----------

export async function listAllServices(db: AppDb) {
  return db.select().from(services).orderBy(asc(services.sortOrder), asc(services.name));
}

export async function getServiceWithRequirements(db: AppDb, serviceId: string) {
  const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!service) return null;
  const requirements = await db
    .select()
    .from(serviceRequirements)
    .where(eq(serviceRequirements.serviceId, serviceId))
    .orderBy(asc(serviceRequirements.sortOrder), asc(serviceRequirements.label));
  return { service, requirements };
}

type ServiceInput = {
  name: string;
  shortDescription: string;
  description: string;
  isActive: boolean;
  // Whole centavos, or null for "no fee yet". Left out (undefined) means "keep the current fee".
  feeCentavos?: number | null;
  // The payment methods this service shows. Empty means "all active methods". Left out means "keep".
  paymentMethodIds?: string[];
};

function checkService(input: ServiceInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120)
    throw new SettingsError("invalid", "The service name needs 2 to 120 characters.");
  if (input.shortDescription.length > 300)
    throw new SettingsError("invalid", "The short description is too long (300 characters).");
  if (input.description.length > 10000)
    throw new SettingsError("invalid", "The description is too long.");
  const fee = input.feeCentavos;
  if (fee !== undefined && fee !== null && (!Number.isSafeInteger(fee) || fee < 0))
    throw new SettingsError("invalid", "The service fee must be a number of pesos, like 5000.");
  return { ...input, name };
}

const feeText = (centavos: number | null) => (centavos === null ? "not set" : formatFee(centavos));

// The payment methods a service shows (empty list = all active methods), and all methods to choose from.
export async function getServicePaymentMethodIds(db: AppDb, serviceId: string) {
  const rows = await db
    .select({ id: servicePaymentMethods.paymentMethodId })
    .from(servicePaymentMethods)
    .where(eq(servicePaymentMethods.serviceId, serviceId));
  return rows.map((row) => row.id);
}

export async function listPaymentMethodChoices(db: AppDb) {
  return db
    .select({ id: paymentMethods.id, name: paymentMethods.name, isActive: paymentMethods.isActive })
    .from(paymentMethods)
    .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name));
}

// New services start with an EMPTY checklist (docs/FEATURES.md A7).
export async function createService(
  db: AppDb,
  actor: AdminProfile,
  input: ServiceInput,
  ipHash?: string | null,
) {
  const clean = checkService(input);
  const slug = slugify(clean.name);
  if (!slug) throw new SettingsError("invalid", "The name must have letters or numbers.");
  try {
    return await db.transaction(async (tx) => {
      const [{ max }] = await tx
        .select({ max: sql<number>`coalesce(max(${services.sortOrder}), 0)::int` })
        .from(services);
      const [row] = await tx
        .insert(services)
        .values({
          slug,
          name: clean.name,
          shortDescription: clean.shortDescription,
          description: clean.description,
          feeCentavos: clean.feeCentavos ?? null,
          isActive: clean.isActive,
          sortOrder: max + 1,
        })
        .returning({ id: services.id });
      await log(tx, actor, {
        action: "service.created",
        entityType: "service",
        entityId: row.id,
        details: { name: clean.name },
        ipHash,
      });
      return row.id;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new SettingsError("slug-taken", "A service with a similar name already exists.");
    throw error;
  }
}

export async function updateService(
  db: AppDb,
  actor: AdminProfile,
  serviceId: string,
  input: ServiceInput,
  ipHash?: string | null,
) {
  const clean = checkService(input);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (!before) throw new SettingsError("not-found", "Service not found.");
    await tx
      .update(services)
      .set({
        name: clean.name,
        shortDescription: clean.shortDescription,
        description: clean.description,
        isActive: clean.isActive,
        ...(clean.feeCentavos !== undefined ? { feeCentavos: clean.feeCentavos } : {}),
      })
      .where(eq(services.id, serviceId));
    if (clean.paymentMethodIds !== undefined) {
      await tx.delete(servicePaymentMethods).where(eq(servicePaymentMethods.serviceId, serviceId));
      if (clean.paymentMethodIds.length > 0)
        await tx
          .insert(servicePaymentMethods)
          .values(
            clean.paymentMethodIds.map((paymentMethodId) => ({ serviceId, paymentMethodId })),
          );
    }
    await log(tx, actor, {
      action: "service.updated",
      entityType: "service",
      entityId: serviceId,
      details: {
        before: { name: before.name, isActive: before.isActive, fee: feeText(before.feeCentavos) },
        after: {
          name: clean.name,
          isActive: clean.isActive,
          fee: feeText(clean.feeCentavos === undefined ? before.feeCentavos : clean.feeCentavos),
          ...(clean.paymentMethodIds !== undefined
            ? { paymentMethodIds: clean.paymentMethodIds }
            : {}),
        },
      },
      ipHash,
    });
  });
}

// Moves a row up or down by swapping its sort_order with its neighbour.
async function swapOrder<T extends { id: string; sortOrder: number }>(
  rows: T[],
  id: string,
  direction: "up" | "down",
  write: (id: string, order: number) => Promise<unknown>,
) {
  const index = rows.findIndex((r) => r.id === id);
  const other = rows[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return;
  // Equal numbers would make a swap do nothing, so we write the new positions of the whole list.
  const order = rows.map((r) => r.id);
  [order[index], order[order.indexOf(other.id)]] = [other.id, id];
  for (let i = 0; i < order.length; i++) await write(order[i], i + 1);
}

export async function moveService(
  db: AppDb,
  actor: AdminProfile,
  serviceId: string,
  direction: "up" | "down",
) {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: services.id, sortOrder: services.sortOrder })
      .from(services)
      .orderBy(asc(services.sortOrder), asc(services.name));
    await swapOrder(rows, serviceId, direction, (id, order) =>
      tx.update(services).set({ sortOrder: order }).where(eq(services.id, id)),
    );
    await log(tx, actor, {
      action: "service.moved",
      entityType: "service",
      entityId: serviceId,
      details: { direction },
    });
  });
}

type RequirementInput = { label: string; details: string; isRequired: boolean };
function checkRequirement(input: RequirementInput) {
  const label = input.label.trim();
  if (label.length < 1 || label.length > 150)
    throw new SettingsError("invalid", "A checklist item needs 1 to 150 characters.");
  if (input.details.length > 500)
    throw new SettingsError("invalid", "The help text is too long (500 characters).");
  return { label, details: input.details.trim() || null, isRequired: input.isRequired };
}

export async function addRequirement(
  db: AppDb,
  actor: AdminProfile,
  serviceId: string,
  input: RequirementInput,
) {
  const clean = checkRequirement(input);
  await db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${serviceRequirements.sortOrder}), 0)::int` })
      .from(serviceRequirements)
      .where(eq(serviceRequirements.serviceId, serviceId));
    await tx.insert(serviceRequirements).values({ serviceId, ...clean, sortOrder: max + 1 });
    await log(tx, actor, {
      action: "requirement.created",
      entityType: "service",
      entityId: serviceId,
      details: { label: clean.label },
    });
  });
}

export async function updateRequirement(
  db: AppDb,
  actor: AdminProfile,
  requirementId: string,
  input: RequirementInput,
) {
  const clean = checkRequirement(input);
  await db.update(serviceRequirements).set(clean).where(eq(serviceRequirements.id, requirementId));
  await log(db, actor, {
    action: "requirement.updated",
    entityType: "service_requirement",
    entityId: requirementId,
    details: { label: clean.label },
  });
}

export async function deleteRequirement(db: AppDb, actor: AdminProfile, requirementId: string) {
  await db.delete(serviceRequirements).where(eq(serviceRequirements.id, requirementId));
  await log(db, actor, {
    action: "requirement.deleted",
    entityType: "service_requirement",
    entityId: requirementId,
  });
}

export async function moveRequirement(
  db: AppDb,
  actor: AdminProfile,
  serviceId: string,
  requirementId: string,
  direction: "up" | "down",
) {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: serviceRequirements.id, sortOrder: serviceRequirements.sortOrder })
      .from(serviceRequirements)
      .where(eq(serviceRequirements.serviceId, serviceId))
      .orderBy(asc(serviceRequirements.sortOrder), asc(serviceRequirements.label));
    await swapOrder(rows, requirementId, direction, (id, order) =>
      tx
        .update(serviceRequirements)
        .set({ sortOrder: order })
        .where(eq(serviceRequirements.id, id)),
    );
  });
}

// ---------- Payment methods (owner only) ----------

export type PaymentMethodInput = {
  id?: string;
  name: string;
  parserKey: string | null;
  accountName: string;
  accountNumber: string;
  instructions: string;
  // A NEW file path (already saved in the public-assets bucket). Undefined keeps the old QR.
  newQrImagePath?: string;
  isActive: boolean;
};

export async function listAllPaymentMethods(db: AppDb) {
  return db
    .select()
    .from(paymentMethods)
    .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name));
}

export async function getPaymentMethod(db: AppDb, id: string) {
  const [row] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);
  return row ?? null;
}

// Runs the change in ONE transaction. The first statement tells the database who the admin is, so the
// database trigger writes the before and after values to activity_log with the right admin id.
// Changing the QR, account name or account number (or adding a method) needs a fresh 2FA code.
export async function savePaymentMethod(
  db: AppDb,
  actor: AdminProfile,
  input: PaymentMethodInput,
  context: { fresh2fa: boolean; ipHash?: string | null },
) {
  if (!hasRole(actor, OWNER_ONLY)) throw new AdminAuthError("wrong-role");

  const name = input.name.trim();
  const accountName = input.accountName.trim();
  const accountNumber = input.accountNumber.trim();
  if (name.length < 2 || name.length > 60)
    throw new SettingsError("invalid", "The name needs 2 to 60 characters.");
  if (accountName.length < 2 || accountName.length > 120)
    throw new SettingsError("invalid", "The account name needs 2 to 120 characters.");
  if (accountNumber.length < 3 || accountNumber.length > 60)
    throw new SettingsError("invalid", "The account number needs 3 to 60 characters.");
  if (input.parserKey && !["gcash", "maya", "bdo"].includes(input.parserKey))
    throw new SettingsError("invalid", "Unknown receipt reader.");

  const before = input.id ? await getPaymentMethod(db, input.id) : null;
  if (input.id && !before) throw new SettingsError("not-found", "Payment method not found.");

  const risky =
    !before ||
    before.accountName !== accountName ||
    before.accountNumber !== accountNumber ||
    (input.newQrImagePath !== undefined && input.newQrImagePath !== before.qrImagePath);
  if (risky && !context.fresh2fa) throw new AdminAuthError("needs-fresh-2fa");

  const values = {
    name,
    parserKey: input.parserKey,
    accountName,
    accountNumber,
    instructions: input.instructions.trim() || null,
    isActive: input.isActive,
    updatedBy: actor.id,
    ...(input.newQrImagePath !== undefined ? { qrImagePath: input.newQrImagePath } : {}),
  };

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor_id', ${actor.id}, true)`);
    let id: string;
    if (before) {
      await tx.update(paymentMethods).set(values).where(eq(paymentMethods.id, before.id));
      id = before.id;
    } else {
      const [{ max }] = await tx
        .select({ max: sql<number>`coalesce(max(${paymentMethods.sortOrder}), 0)::int` })
        .from(paymentMethods);
      const [row] = await tx
        .insert(paymentMethods)
        .values({ ...values, sortOrder: max + 1 })
        .returning({ id: paymentMethods.id });
      id = row.id;
    }
    if (risky) {
      // A specific, easy-to-find row. The database trigger also writes the full before/after row.
      await log(tx, actor, {
        action: !before
          ? "payment_method.created"
          : input.newQrImagePath !== undefined && input.newQrImagePath !== before.qrImagePath
            ? "payment_method.qr_changed"
            : "payment_method.account_changed",
        entityType: "payment_method",
        entityId: id,
        details: {
          before: before
            ? {
                accountName: before.accountName,
                accountNumber: before.accountNumber,
                qrImagePath: before.qrImagePath,
              }
            : null,
          after: {
            accountName,
            accountNumber,
            qrImagePath: input.newQrImagePath ?? before?.qrImagePath ?? null,
          },
        },
        ipHash: context.ipHash,
      });
    }
    // The caller sends the "payment method changed" alert email to the owner when `risky` is true.
    return { id, risky };
  });
}

export async function setPaymentMethodActive(
  db: AppDb,
  actor: AdminProfile,
  id: string,
  isActive: boolean,
) {
  if (!hasRole(actor, OWNER_ONLY)) throw new AdminAuthError("wrong-role");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor_id', ${actor.id}, true)`);
    await tx
      .update(paymentMethods)
      .set({ isActive, updatedBy: actor.id })
      .where(eq(paymentMethods.id, id));
  });
}

export async function movePaymentMethod(
  db: AppDb,
  actor: AdminProfile,
  id: string,
  direction: "up" | "down",
) {
  if (!hasRole(actor, OWNER_ONLY)) throw new AdminAuthError("wrong-role");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor_id', ${actor.id}, true)`);
    const rows = await tx
      .select({ id: paymentMethods.id, sortOrder: paymentMethods.sortOrder })
      .from(paymentMethods)
      .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name));
    await swapOrder(rows, id, direction, (rowId, order) =>
      tx.update(paymentMethods).set({ sortOrder: order }).where(eq(paymentMethods.id, rowId)),
    );
  });
}

// Delete is allowed only when no payment used the method. Otherwise: turn it off.
export async function deletePaymentMethod(
  db: AppDb,
  actor: AdminProfile,
  id: string,
  context: { fresh2fa: boolean },
) {
  if (!hasRole(actor, OWNER_ONLY)) throw new AdminAuthError("wrong-role");
  if (!context.fresh2fa) throw new AdminAuthError("needs-fresh-2fa");
  const [{ used }] = await db
    .select({ used: count() })
    .from(payments)
    .where(eq(payments.paymentMethodId, id));
  if (used > 0)
    throw new SettingsError("in-use", "This method is used by payments. Turn it off instead.");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor_id', ${actor.id}, true)`);
    await tx.delete(paymentMethods).where(and(eq(paymentMethods.id, id)));
  });
}
