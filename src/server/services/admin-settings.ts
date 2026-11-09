import "server-only";

// Admin changes to services, checklists, site settings and payment methods.
// Roles (CLAUDE.md rule 5, docs/FEATURES.md A6 to A8):
// Who may do what is in the role table (src/lib/permissions.ts). Each function here checks it again with
// assertCan, even though the Server Action already did (CLAUDE.md rule 5).
//   - payment methods, site content, file settings: admin and owner (fresh 2FA for the risky payment fields)
//   - services and checklists: staff may change words only. No fee, no hide, no delete.

import { asc, count, eq, getTableColumns, inArray, sql } from "drizzle-orm";

import { formatFee } from "@/lib/money";

import { slugify } from "@/lib/slug";
import { parseSetting, type SettingKey, type SettingValue } from "@/lib/validation/settings";
import { PanelAuthError, assertCan, type PanelUser } from "@/server/auth/panel-core";
import { setActor } from "@/server/db/actor";
import {
  activityLog,
  paymentMethods,
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

async function log(db: Pick<AppDb, "insert">, actor: PanelUser, entry: Log) {
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

export const OWNER_SETTING_KEYS: readonly SettingKey[] = [
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
  actor: PanelUser,
  key: K,
  value: unknown,
  ipHash?: string | null,
): Promise<SettingValue<K>> {
  if (!EDITABLE_SETTING_KEYS.includes(key))
    throw new SettingsError("invalid", "That setting cannot be changed here.");
  assertCan(actor, OWNER_SETTING_KEYS.includes(key) ? "file_settings.edit" : "site_content.edit");

  const parsed = parseSetting(key, value); // throws a ZodError for a bad value
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
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

export const SERVICES_PAGE_SIZE = 10;

// One page of services (10 per page) for the admin table, in the order the clients see them. `requestCount` is how many
// requests used the service: a service with requests cannot be deleted (the history of those requests needs it).
export async function listServicesPage(
  db: AppDb,
  options: { page?: number; perPage?: number } = {},
) {
  const perPage = options.perPage ?? SERVICES_PAGE_SIZE;
  const [{ total }] = await db.select({ total: count() }).from(services);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      slug: services.slug,
      feeCentavos: services.feeCentavos,
      isActive: services.isActive,
      sortOrder: services.sortOrder,
      requestCount: sql<number>`(select count(*)::int from requests r where r.service_id = services.id)`,
    })
    .from(services)
    .orderBy(asc(services.sortOrder), asc(services.name))
    .limit(perPage)
    .offset((page - 1) * perPage);
  return { rows, total, page, perPage, pageCount };
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
  description: string;
  // Left out (undefined) means "keep the current value". Staff may not send it (services.set_visibility).
  isActive?: boolean;
  // Whole centavos, or null for "no fee yet". Left out (undefined) means "keep the current fee".
  feeCentavos?: number | null;
  // The payment methods this service shows. Empty means "all active methods". Left out means "keep".
  paymentMethodIds?: string[];
};

function checkService(input: ServiceInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120)
    throw new SettingsError("invalid", "The service name needs 2 to 120 characters.");
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
  actor: PanelUser,
  input: ServiceInput,
  ipHash?: string | null,
) {
  assertCan(actor, "services.create");
  // Staff add a service that is hidden and has no fee. An admin or owner can set both.
  if (input.isActive === true) assertCan(actor, "services.set_visibility");
  if (input.feeCentavos !== undefined && input.feeCentavos !== null)
    assertCan(actor, "services.edit_fee");
  const clean = checkService(input);
  const slug = slugify(clean.name);
  if (!slug) throw new SettingsError("invalid", "The name must have letters or numbers.");
  try {
    return await db.transaction(async (tx) => {
      await setActor(tx, actor.id);
      const [{ max }] = await tx
        .select({ max: sql<number>`coalesce(max(${services.sortOrder}), 0)::int` })
        .from(services);
      const [row] = await tx
        .insert(services)
        .values({
          slug,
          name: clean.name,
          description: clean.description,
          feeCentavos: clean.feeCentavos ?? null,
          isActive: clean.isActive ?? false,
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
  actor: PanelUser,
  serviceId: string,
  input: ServiceInput,
  ipHash?: string | null,
) {
  assertCan(actor, "services.edit_text");
  const clean = checkService(input);
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const [before] = await tx.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (!before) throw new SettingsError("not-found", "Service not found.");
    // A field that CHANGES needs its own permission (staff can send the same value, but not a new one).
    if (clean.feeCentavos !== undefined && clean.feeCentavos !== before.feeCentavos)
      assertCan(actor, "services.edit_fee");
    if (clean.isActive !== undefined && clean.isActive !== before.isActive)
      assertCan(actor, "services.set_visibility");
    if (clean.paymentMethodIds !== undefined) assertCan(actor, "services.payment_links");
    const isActive = clean.isActive ?? before.isActive;
    await tx
      .update(services)
      .set({
        name: clean.name,
        description: clean.description,
        isActive,
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
          isActive,
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
  actor: PanelUser,
  serviceId: string,
  direction: "up" | "down",
) {
  assertCan(actor, "services.reorder");
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
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

// ---------- Delete (single and bulk) ----------
// Admin and owner only, with a fresh confirm. A service that requests used stays (turn it off instead): the
// requests keep pointing to it for their history. The checklist and the payment QR choices of a deleted service go with it.
export type DeleteServicesResult = {
  deleted: { id: string; name: string }[];
  skipped: { id: string; name: string; reason: "has-requests" | "not-found"; requests?: number }[];
};

export async function deleteServices(
  db: AppDb,
  actor: PanelUser,
  input: { ids: string[] },
  context: { fresh2fa: boolean; ipHash?: string | null },
): Promise<DeleteServicesResult> {
  assertCan(actor, "services.delete");
  if (!context.fresh2fa) throw new PanelAuthError("needs-fresh-2fa");
  const ids = [...new Set(input.ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) throw new SettingsError("invalid", "Choose at least one service.");
  if (ids.length > 100)
    throw new SettingsError("invalid", "Choose at most 100 services at a time.");

  return db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const found = await tx
      .select({
        id: services.id,
        name: services.name,
        slug: services.slug,
        requestCount: sql<number>`(select count(*)::int from requests r where r.service_id = services.id)`,
      })
      .from(services)
      .where(inArray(services.id, ids));
    const result: DeleteServicesResult = { deleted: [], skipped: [] };
    const known = new Set(found.map((s) => s.id));
    for (const id of ids)
      if (!known.has(id)) result.skipped.push({ id, name: "", reason: "not-found" });

    const deletable = found.filter((s) => s.requestCount === 0);
    for (const s of found.filter((s) => s.requestCount > 0))
      result.skipped.push({
        id: s.id,
        name: s.name,
        reason: "has-requests",
        requests: s.requestCount,
      });

    if (deletable.length > 0) {
      await tx.delete(services).where(
        inArray(
          services.id,
          deletable.map((s) => s.id),
        ),
      );
      for (const s of deletable) {
        result.deleted.push({ id: s.id, name: s.name });
        await log(tx, actor, {
          action: "service.deleted",
          entityType: "service",
          entityId: s.id,
          details: { name: s.name, slug: s.slug, bulk: ids.length > 1 },
          ipHash: context.ipHash,
        });
      }
    }
    return result;
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
  actor: PanelUser,
  serviceId: string,
  input: RequirementInput,
) {
  assertCan(actor, "checklist.add");
  const clean = checkRequirement(input);
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
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
  actor: PanelUser,
  requirementId: string,
  input: RequirementInput,
) {
  assertCan(actor, "checklist.edit");
  const clean = checkRequirement(input);
  await db.update(serviceRequirements).set(clean).where(eq(serviceRequirements.id, requirementId));
  await log(db, actor, {
    action: "requirement.updated",
    entityType: "service_requirement",
    entityId: requirementId,
    details: { label: clean.label },
  });
}

export async function deleteRequirement(db: AppDb, actor: PanelUser, requirementId: string) {
  assertCan(actor, "checklist.delete");
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    await tx.delete(serviceRequirements).where(eq(serviceRequirements.id, requirementId));
    await log(tx, actor, {
      action: "requirement.deleted",
      entityType: "service_requirement",
      entityId: requirementId,
    });
  });
}

export async function moveRequirement(
  db: AppDb,
  actor: PanelUser,
  serviceId: string,
  requirementId: string,
  direction: "up" | "down",
) {
  assertCan(actor, "checklist.reorder");
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
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

// Every method, in the order clients see them. "paymentCount" is how many payments used the method: a method that
// payments used cannot be deleted (the list says so before the person confirms).
export async function listAllPaymentMethods(db: AppDb) {
  return db
    .select({
      ...getTableColumns(paymentMethods),
      paymentCount: sql<number>`(select count(*)::int from payments p where p.payment_method_id = payment_methods.id)`,
    })
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
  actor: PanelUser,
  input: PaymentMethodInput,
  context: { fresh2fa: boolean; ipHash?: string | null },
) {
  assertCan(actor, "payment_methods.manage");

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
  if (risky && !context.fresh2fa) throw new PanelAuthError("needs-fresh-2fa");

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
    await setActor(tx, actor.id);
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
  actor: PanelUser,
  id: string,
  isActive: boolean,
) {
  assertCan(actor, "payment_methods.manage");
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    await tx
      .update(paymentMethods)
      .set({ isActive, updatedBy: actor.id })
      .where(eq(paymentMethods.id, id));
  });
}

export async function movePaymentMethod(
  db: AppDb,
  actor: PanelUser,
  id: string,
  direction: "up" | "down",
) {
  assertCan(actor, "payment_methods.manage");
  await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const rows = await tx
      .select({ id: paymentMethods.id, sortOrder: paymentMethods.sortOrder })
      .from(paymentMethods)
      .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name));
    await swapOrder(rows, id, direction, (rowId, order) =>
      tx.update(paymentMethods).set({ sortOrder: order }).where(eq(paymentMethods.id, rowId)),
    );
  });
}

export type DeletePaymentMethodsResult = {
  deleted: { id: string; name: string }[];
  skipped: { id: string; name: string; reason: "has-payments" | "not-found"; payments?: number }[];
};

// Deletes one or many methods in ONE transaction (the list screen sends the ticked ones). OWNER AND ADMIN, with
// a fresh 2FA code. A method that payments used is kept (turn it off instead) and is named in "skipped", so one
// used method never blocks the others. Each deleted method is written to the activity log by the app (name and
// "bulk") and, with the real before values, by the database trigger.
export async function deletePaymentMethods(
  db: AppDb,
  actor: PanelUser,
  input: { ids: string[] },
  context: { fresh2fa: boolean; ipHash?: string | null },
): Promise<DeletePaymentMethodsResult> {
  assertCan(actor, "payment_methods.manage");
  if (!context.fresh2fa) throw new PanelAuthError("needs-fresh-2fa");
  const ids = [...new Set(input.ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) throw new SettingsError("invalid", "Choose at least one payment method.");
  if (ids.length > 100)
    throw new SettingsError("invalid", "Choose at most 100 payment methods at a time.");

  return db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const found = await tx
      .select({
        id: paymentMethods.id,
        name: paymentMethods.name,
        paymentCount: sql<number>`(select count(*)::int from payments p where p.payment_method_id = payment_methods.id)`,
      })
      .from(paymentMethods)
      .where(inArray(paymentMethods.id, ids));
    const result: DeletePaymentMethodsResult = { deleted: [], skipped: [] };
    const known = new Set(found.map((m) => m.id));
    for (const id of ids)
      if (!known.has(id)) result.skipped.push({ id, name: "", reason: "not-found" });

    for (const m of found.filter((m) => m.paymentCount > 0))
      result.skipped.push({
        id: m.id,
        name: m.name,
        reason: "has-payments",
        payments: m.paymentCount,
      });

    const deletable = found.filter((m) => m.paymentCount === 0);
    if (deletable.length > 0) {
      await tx.delete(paymentMethods).where(
        inArray(
          paymentMethods.id,
          deletable.map((m) => m.id),
        ),
      );
      for (const m of deletable) {
        result.deleted.push({ id: m.id, name: m.name });
        await log(tx, actor, {
          action: "payment_method.deleted",
          entityType: "payment_method",
          entityId: m.id,
          details: { name: m.name, bulk: ids.length > 1 },
          ipHash: context.ipHash,
        });
      }
    }
    return result;
  });
}
