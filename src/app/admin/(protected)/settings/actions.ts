"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { safeContactUrl } from "@/lib/contact-links";
import type { SettingKey } from "@/lib/validation/settings";
import { withAdmin, type ActionResult } from "@/server/auth/admin";
import { CACHE_TAGS } from "@/server/cache-tags";
import { getDb } from "@/server/db/client";
import {
  addRequirement,
  createService,
  deleteRequirement,
  moveRequirement,
  moveService,
  saveSetting,
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
  return withAdmin({ formData }, async ({ admin, ipHash }) => {
    const key = text(formData, "key") as SettingKey;
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

const serviceInput = (formData: FormData) => ({
  name: text(formData, "name"),
  shortDescription: text(formData, "shortDescription"),
  description: text(formData, "description"),
  isActive: flag(formData, "isActive"),
});

export async function createServiceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await withAdmin({ formData }, async ({ admin, ipHash }) => {
    createdId = await createService(getDb(), admin, serviceInput(formData), ipHash);
    updateTag(CACHE_TAGS.services);
    return { ok: true, message: "Service created." };
  });
  if (result.ok && createdId) redirect(`/admin/settings/services/${createdId}`);
  return result;
}

export async function updateServiceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ formData }, async ({ admin, ipHash }) => {
    await updateService(getDb(), admin, text(formData, "id"), serviceInput(formData), ipHash);
    updateTag(CACHE_TAGS.services);
    revalidatePath("/admin/settings/services");
    return { ok: true, message: "Saved. The website shows it now." };
  });
}

// One action for the small buttons in the services list: turn on or off, move up or down.
export async function serviceListAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ formData }, async ({ admin, ipHash }) => {
    const db = getDb();
    const id = text(formData, "id");
    const intent = text(formData, "intent");
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
          shortDescription: s.shortDescription,
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
  return withAdmin({ formData }, async ({ admin }) => {
    const db = getDb();
    const serviceId = text(formData, "serviceId");
    const id = text(formData, "id");
    const intent = text(formData, "intent");
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
