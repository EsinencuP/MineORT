import "server-only";
import { authorsOf } from "@/lib/social/store";
import { db } from "@/lib/supabase-admin";
import { isEnabled } from "@/lib/flags";

export const progressEnabled = () => isEnabled("ff_community_progress");
export const METRICS: Record<string, string> = {
  walked_blocks: "Блоков пешком",
  active_seconds: "Секунд активной игры",
  afk_seconds: "Секунд в АФК",
  elytra_blocks: "Блоков на элитрах",
  mined_blocks: "Добыто естественных блоков",
  nether_mobs: "Побеждено мобов в Незере",
  discovered_regions: "Открыто районов",
};

export function parseStatValues(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw);
  if (!entries.length || entries.length > 80) return null;
  if (
    entries.some(
      ([key, value]) =>
        (!Object.hasOwn(METRICS, key) &&
          !/^(?:ore|flower|wood|block|mob):[a-z0-9_]{1,40}$/.test(key)) ||
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > 1_000_000,
    )
  )
    return null;
  return Object.fromEntries(entries) as Record<string, number>;
}

export function parseDiscoveredRegions(raw: unknown) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 100) return null;
  if (
    raw.some(
      (r) =>
        !r ||
        (r.dim !== "overworld" && r.dim !== "nether") ||
        !Number.isInteger(r.rx) ||
        !Number.isInteger(r.rz) ||
        Math.abs(r.rx) > 58594 ||
        Math.abs(r.rz) > 58594,
    )
  )
    return null;
  return raw.map(({ dim, rx, rz }) => ({ dim, rx, rz }));
}

export const PERSONAL_ACHIEVEMENTS = {
  marker: { title: "След на карте", rule: "Первая одобренная публичная метка" },
  cartographer: {
    title: "Картограф",
    rule: "Открыть район и опубликовать одобренную метку в нём",
  },
  raid_contribution: {
    title: "Вклад в стройку",
    rule: "Организатор подтвердил вклад в проектный рейд",
  },
};

export async function awardProgress(
  userId: string,
  code: keyof typeof PERSONAL_ACHIEVEMENTS,
) {
  if (!progressEnabled()) return;
  const { error } = await db().rpc("game_award", {
    p_user: userId,
    p_code: code,
  });
  if (error) throw new Error(`progress award: ${error.message}`);
  if (code === "marker") {
    const check = await db().rpc("game_check_cartographer", { p_user: userId });
    if (check.error)
      throw new Error(`cartographer award: ${check.error.message}`);
  }
}

export async function playerProgress(userId: string) {
  const [totals, awards] = await Promise.all([
    db().rpc("game_totals", { p_user: userId }),
    db()
      .from("game_achievements")
      .select("code,earned_at")
      .eq("user_id", userId)
      .order("earned_at"),
  ]);
  if (totals.error || awards.error)
    throw new Error("player progress lookup failed");
  return {
    metrics: totals.data as { metric: string; value: number }[],
    awards: awards.data as { code: string; earned_at: string }[],
  };
}

export async function seasonProgress() {
  const seasons = await db()
    .from("game_seasons")
    .select("id,name,starts_on,ends_on,metrics")
    .order("starts_on", { ascending: false })
    .limit(6);
  if (seasons.error)
    throw new Error(`seasons lookup: ${seasons.error.message}`);
  if (!seasons.data.length) return [];
  return Promise.all(
    seasons.data.map(async (season) => {
      const ranks = await db().rpc("game_season_ranks", {
        p_season: season.id,
      });
      if (ranks.error)
        throw new Error(`season leaders: ${ranks.error.message}`);
      const rows = ranks.data as {
        user_id: string;
        place: number;
        metric: string;
        value: number;
      }[];
      const authors = await authorsOf([
        ...new Set(rows.map((row) => row.user_id)),
      ]);
      return {
        id: season.id as string,
        name: season.name as string,
        startsOn: season.starts_on as string,
        endsOn: season.ends_on as string,
        metrics: season.metrics as string[],
        ranks: rows.map((row) => ({
          ...row,
          name:
            authors.get(row.user_id)?.nick ??
            authors.get(row.user_id)?.name ??
            "Игрок",
        })),
      };
    }),
  );
}
