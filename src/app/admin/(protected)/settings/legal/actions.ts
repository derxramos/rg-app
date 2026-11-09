"use server";

import { revalidatePath, updateTag } from "next/cache";

import { withPanel, type ActionResult } from "@/server/auth/panel";
import { CACHE_TAGS } from "@/server/cache-tags";
import { getDb } from "@/server/db/client";
import { saveLegalDocument } from "@/server/services/legal";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// Saves the Privacy notice or the Terms as a NEW version. admin or owner (the role table says "legal_text.edit",
// and the service checks it again). The public pages show the new text at once.
export async function saveLegalAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "legal_text.edit", formData }, async ({ admin, ipHash }) => {
    const saved = await saveLegalDocument(
      getDb(),
      admin,
      { kind: text(formData, "kind"), body: text(formData, "body") },
      ipHash,
    );
    updateTag(CACHE_TAGS.legal);
    revalidatePath("/admin/settings/legal", "layout");
    return { ok: true, message: `Saved as version ${saved.version}. The website shows it now.` };
  });
}
