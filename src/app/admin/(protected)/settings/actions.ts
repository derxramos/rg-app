"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { safeContactUrl } from "@/lib/contact-links";
import { parsePesosToCentavos } from "@/lib/money";
import { can, type Action, type Role } from "@/lib/permissions";
import type { SettingKey } from "@/lib/validation/settings";
import { withPanel, type ActionResult } from "@/server/auth/panel";
import { CACHE_TAGS } from "@/server/cache-tags";
import { getDb } from "@/server/db/client";
import {
  OWNER_SETTING_KEYS,
  addRequirement,
  createService,
  deleteRequirement,
  deleteServices,
  moveRequirement,
  moveService,
  saveSetting,
  SettingsError,
  updateRequirement,
  updateService,
} from "@/server/services/admin-settings";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const flag = (formData: FormData, name: string) => formData.get(name) === "on";

// ---------- Site content and file settings ----------

function valueFor(key: SettingKey, formData: FormData): unknown {
  switch (key) {
    case "contact":
      return {
        phone: text(formData, "phone"),
        email: text(formData, "email"),
        address: text(formData, "address"),
      };
    case "business_hours":
      return { text: text(formData, "text") };
    case "social_links":
      return { messenger: text(formData, "messenger"), viber: text(formData, "viber") };
    case "home_texts":
      return { headline: text(formData, "headline"), intro: text(formData, "intro") };
    case "privacy_notice_version":
      return text(formData, "value");
    default:
      return Number(text(formData, "value"));
  }
}

export async function saveSettingAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const key = text(formData, "key") as SettingKey;
  // File settings and site content are different actions in the role table.
  const action: Action = OWNER_SETTING_KEYS.includes(key)
    ? "file_settings.edit"
    : "site_content.edit";
  return withPanel({ action, formData }, async ({ admin, ipHash }) => {
    if (key === "social_links") {
      // Only safe link types may be saved (src/lib/contact-links.ts).
      for (const name of ["messenger", "viber"]) {
        const value = text(formData, name);
        if (value.trim() && !safeContactUrl(value)) {
          return {
            ok: false,
            code: "invalid",
            message: `The ${name} link must start with https:// (Viber may also start with viber://).`,
          };
        }
      }
    }
    await saveSetting(getDb(), admin, key, valueFor(key, formData), ipHash);
    // Public pages show the change at once.
    updateTag(CACHE_TAGS.settings);
    return { ok: true, message: "Saved. The website shows it now." };
  });
}

// ---------- Services ----------

// The fee box holds pesos ("5000"). A bad value stops the save with a clear message.
// Only the fields the role may change are read. Staff forms have no fee, no on/off box and no QR choices,
// so those fields stay out (undefined = keep the current value). The service layer checks the role again.
function serviceInput(formData: FormData, role: Role) {
  const feeCentavos = can(role, "services.edit_fee")
    ? parsePesosToCentavos(text(formData, "fee"))
    : undefined;
  if (feeCentavos !== undefined && Number.isNaN(feeCentavos))
    throw new SettingsError("invalid", "The service fee must be a number of pesos, like 5000.");
  const paymentMethodIds = formData
    .getAll("paymentMethodIds")
    .map(String)
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return {
    name: text(formData, "name"),
    description: text(formData, "description"),
    ...(can(role, "services.set_visibility") ? { isActive: flag(formData, "isActive") } : {}),
    feeCentavos,
    // Only the edit page has the QR checkboxes. The "add" form leaves them out.
    ...(can(role, "services.payment_links") && formData.get("hasPaymentChoices")
      ? { paymentMethodIds }
      : {}),
  };
}

export async function createServiceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await withPanel(
    { action: "services.create", formData },
    async ({ admin, ipHash }) => {
      createdId = await createService(getDb(), admin, serviceInput(formData, admin.role), ipHash);
      updateTag(CACHE_TAGS.services);
      return { ok: true, message: "Service created." };
    },
  );
  if (result.ok && createdId) redirect(`/admin/settings/services/${createdId}`);
  return result;
}

export async function updateServiceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "services.edit_text", formData }, async ({ admin, ipHash }) => {
    await updateService(
      getDb(),
      admin,
      text(formData, "id"),
      serviceInput(formData, admin.role),
      ipHash,
    );
    updateTag(CACHE_TAGS.services);
    revalidatePath("/admin/settings/services");
    return { ok: true, message: "Saved. The website shows it now." };
  });
}

// Delete one or many services (admin and owner, with the fresh confirm). A service that requests used is kept:
// the answer says which ones were deleted and which were skipped, and why.
export async function deleteServicesAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "services.delete", formData }, async ({ admin, ipHash, fresh2fa }) => {
    const result = await deleteServices(
      getDb(),
      admin,
      { ids: formData.getAll("ids").map(String) },
      { fresh2fa, ipHash },
    );
    updateTag(CACHE_TAGS.services);
    revalidatePath("/admin/settings/services");
    const kept = result.skipped.filter((s) => s.reason === "has-requests");
    const parts: string[] = [];
    if (result.deleted.length > 0)
      parts.push(
        result.deleted.length === 1
          ? `The service "${result.deleted[0].name}" was deleted.`
          : `${result.deleted.length} services were deleted.`,
      );
    if (kept.length > 0)
      parts.push(
        `Not deleted (clients used them in requests, turn them off instead): ${kept.map((s) => s.name).join(", ")}.`,
      );
    if (result.deleted.length === 0)
      return { ok: false, code: "invalid", message: parts.join(" ") || "Nothing was deleted." };
    return { ok: true, message: parts.join(" ") };
  });
}

// One action for the small buttons in the services list: turn on or off, move up or down.
export async function serviceListAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // On/off and moving are different actions in the role table.
  const listIntent = text(formData, "intent");
  const listAction: Action =
    listIntent === "on" || listIntent === "off" ? "services.set_visibility" : "services.reorder";
  return withPanel({ action: listAction, formData }, async ({ admin, ipHash }) => {
    const db = getDb();
    const id = text(formData, "id");
    const intent = listIntent;
    if (intent === "up" || intent === "down") await moveService(db, admin, id, intent);
    else if (intent === "on" || intent === "off") {
      const { getServiceWithRequirements } = await import("@/server/services/admin-settings");
      const found = await getServiceWithRequirements(db, id);
      if (!found) return { ok: false, code: "invalid", message: "Service not found." };
      const s = found.service;
      await updateService(
        db,
        admin,
        id,
        {
          name: s.name,
          description: s.description,
          isActive: intent === "on",
        },
        ipHash,
      );
    }
    updateTag(CACHE_TAGS.services);
    revalidatePath("/admin/settings/services");
    return { ok: true, message: "Done." };
  });
}

// ---------- Checklist items ----------

export async function requirementAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const intent = text(formData, "intent");
  const requirementPermission: Action =
    intent === "add"
      ? "checklist.add"
      : intent === "delete"
        ? "checklist.delete"
        : intent === "up" || intent === "down"
          ? "checklist.reorder"
          : "checklist.edit";
  return withPanel({ action: requirementPermission, formData }, async ({ admin }) => {
    const db = getDb();
    const serviceId = text(formData, "serviceId");
    const id = text(formData, "id");
    const input = {
      label: text(formData, "label"),
      details: text(formData, "details"),
      isRequired: flag(formData, "isRequired"),
    };
    if (intent === "add") await addRequirement(db, admin, serviceId, input);
    else if (intent === "save") await updateRequirement(db, admin, id, input);
    else if (intent === "delete") await deleteRequirement(db, admin, id);
    else if (intent === "up" || intent === "down")
      await moveRequirement(db, admin, serviceId, id, intent);
    else return { ok: false, code: "invalid", message: "Unknown action." };
    updateTag(CACHE_TAGS.services);
    revalidatePath(`/admin/settings/services/${serviceId}`);
    return { ok: true, message: "Saved. The website shows it now." };
  });
}
