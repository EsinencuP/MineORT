"use server";

import { redirect } from "next/navigation";
import {
  GuideError,
  SETTING_KEYS,
  saveArticle,
  saveSettings,
  type SettingKey,
} from "@/lib/guides/store";
import { requireStaff } from "@/lib/auth/guards";

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

/** Staff-only; the role is re-checked on every call because actions can be POSTed directly. */
export async function saveArticleAction(formData: FormData) {
  const user = await requireStaff(["admin"]);
  const id = str(formData.get("id")) || null;
  let error: string | null = null;
  let savedId = id;
  try {
    savedId = await saveArticle(user.userId, id, {
      slug: str(formData.get("slug")),
      category: str(formData.get("category")),
      title: str(formData.get("title")),
      summary: str(formData.get("summary")),
      body:
        typeof formData.get("body") === "string"
          ? (formData.get("body") as string)
          : "",
      tags: str(formData.get("tags"))
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      published: formData.get("published") === "on",
      verifiedAt: str(formData.get("verified_at")) || null,
    });
  } catch (e) {
    if (!(e instanceof GuideError)) throw e;
    error = e.code;
  }
  if (error) redirect(`/admin/guides/${id ?? "new"}?error=${error}`);
  redirect(`/admin/guides?ok=saved&id=${savedId}`);
}

export async function saveSettingsAction(formData: FormData) {
  const user = await requireStaff(["admin"]);
  const values: Partial<Record<SettingKey, string>> = {};
  for (const key of SETTING_KEYS) values[key] = str(formData.get(key));
  await saveSettings(user.userId, values);
  redirect("/admin/guides?ok=settings");
}
