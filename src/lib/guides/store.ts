import "server-only";
import { db } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const CATEGORIES = [
  { id: "install", title: "Установка и вход" },
  { id: "mods", title: "Моды и сборка" },
  { id: "plugins", title: "Плагины" },
  { id: "map-guilds", title: "Карта и гильдии" },
  { id: "troubleshooting", title: "Решение ошибок" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const categoryTitle = (id: string) =>
  CATEGORIES.find((c) => c.id === id)?.title ?? id;

export type Article = {
  id: string;
  slug: string;
  category: CategoryId;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  published: boolean;
  verified_at: string | null;
  updated_at: string;
};

const COLUMNS =
  "id, slug, category, title, summary, body, tags, published, verified_at, updated_at";

/** Removes characters that are special in a PostgREST filter string or in LIKE patterns. */
export function sanitizeQuery(q: string): string {
  return q
    .replace(/[,()%_*\\"'`;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export async function listPublished(): Promise<Article[]> {
  const { data, error } = await db()
    .from("guide_articles")
    .select(COLUMNS)
    .eq("published", true)
    .order("title");
  if (error) throw new Error(`guide_articles select: ${error.message}`);
  return (data ?? []) as Article[];
}

export async function searchPublished(q: string): Promise<Article[]> {
  const clean = sanitizeQuery(q);
  if (!clean) return [];
  const { data, error } = await db()
    .from("guide_articles")
    .select(COLUMNS)
    .eq("published", true)
    .or(`title.ilike.%${clean}%,summary.ilike.%${clean}%,body.ilike.%${clean}%`)
    .order("title")
    .limit(30);
  if (error) throw new Error(`guide_articles search: ${error.message}`);
  return (data ?? []) as Article[];
}

/** Published article by slug; null (so the page answers 404) for unknown or unpublished slugs. */
export async function getPublishedBySlug(
  slug: string,
): Promise<Article | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await db()
    .from("guide_articles")
    .select(COLUMNS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error(`guide_articles select: ${error.message}`);
  return (data as Article | null) ?? null;
}

export async function listAllForAdmin(): Promise<Article[]> {
  const { data, error } = await db()
    .from("guide_articles")
    .select(COLUMNS)
    .order("category")
    .order("title");
  if (error) throw new Error(`guide_articles select: ${error.message}`);
  return (data ?? []) as Article[];
}

export async function getByIdForAdmin(id: string): Promise<Article | null> {
  const { data, error } = await db()
    .from("guide_articles")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`guide_articles select: ${error.message}`);
  return (data as Article | null) ?? null;
}

export type ArticleInput = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  published: boolean;
  verifiedAt: string | null;
};

export class GuideError extends Error {
  constructor(public readonly code: "bad_input" | "slug_taken") {
    super(code);
  }
}

export function validateArticle(a: ArticleInput): void {
  const okCategory = CATEGORIES.some((c) => c.id === a.category);
  const okSlug = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug) && a.slug.length <= 80;
  const okDate =
    a.verifiedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(a.verifiedAt);
  if (
    !okCategory ||
    !okSlug ||
    !okDate ||
    !a.title.trim() ||
    a.title.length > 200 ||
    a.body.length > 50_000
  ) {
    throw new GuideError("bad_input");
  }
}

/** Creates or updates an article; changes are audited. No code release is needed to edit content. */
export async function saveArticle(
  actorId: string,
  id: string | null,
  a: ArticleInput,
): Promise<string> {
  validateArticle(a);
  const row = {
    slug: a.slug,
    category: a.category,
    title: a.title.trim(),
    summary: a.summary.trim().slice(0, 500),
    body: a.body,
    tags: a.tags
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10),
    published: a.published,
    verified_at: a.verifiedAt,
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  };
  const query = id
    ? db().from("guide_articles").update(row).eq("id", id).select("id").single()
    : db().from("guide_articles").insert(row).select("id").single();
  const { data, error } = await query;
  if (error) {
    if (error.code === "23505") throw new GuideError("slug_taken");
    throw new Error(`guide_articles save: ${error.message}`);
  }
  await writeAudit(actorId, id ? "guide.updated" : "guide.created", {
    article_id: data.id,
    slug: a.slug,
    published: a.published,
  });
  return data.id as string;
}

// ---- site settings (server address, versions, client build) ----
export const SETTING_KEYS = [
  "server_address",
  "minecraft_version",
  "client_build_version",
  "client_build_checksum",
  "client_build_url",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const { data, error } = await db().from("site_settings").select("key, value");
  if (error) throw new Error(`site_settings select: ${error.message}`);
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ""])) as Record<
    SettingKey,
    string
  >;
  for (const r of data ?? [])
    if ((SETTING_KEYS as readonly string[]).includes(r.key))
      out[r.key as SettingKey] = r.value;
  return out;
}

export async function saveSettings(
  actorId: string,
  values: Partial<Record<SettingKey, string>>,
) {
  const rows = Object.entries(values)
    .filter(([k]) => (SETTING_KEYS as readonly string[]).includes(k))
    .map(([key, value]) => ({
      key,
      value: String(value ?? "")
        .trim()
        .slice(0, 500),
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    }));
  if (!rows.length) return;
  const { error } = await db()
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`site_settings upsert: ${error.message}`);
  await writeAudit(actorId, "settings.updated", {
    keys: rows.map((r) => r.key),
  });
}

/** The user's build is outdated when it differs from the current build version (when one is set). */
export function isBuildOutdated(current: string, mine: string): boolean {
  return (
    current.trim() !== "" &&
    mine.trim() !== "" &&
    current.trim() !== mine.trim()
  );
}
