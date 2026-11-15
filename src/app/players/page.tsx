import type { Metadata } from "next";
import Link from "next/link";
import { GuildTag } from "@/components/guilds/guild-tag";
import { PlayerCard } from "@/components/guilds/player-card";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { isEnabled, requireFlag } from "@/lib/flags";
import { listGuilds, listPlayers } from "@/lib/guilds/store";
import { safely } from "@/lib/safe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Игроки" };

export default async function PlayersPage({
  searchParams,
}: PageProps<"/players">) {
  await requireFlag("ff_p1a");
  const sp = await searchParams;
  const guildsOn = isEnabled("ff_p1b_guilds");
  const tab = guildsOn && sp.tab === "guilds" ? "guilds" : "players";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 32) : "";
  const g = guildsOn && typeof sp.g === "string" ? sp.g.slice(0, 40) : "";
  const page = Math.max(0, Number.parseInt(String(sp.p ?? "0"), 10) || 0);

  const guilds = guildsOn ? await safely("guilds", listGuilds, []) : [];
  const result =
    tab === "players"
      ? await safely("players", () => listPlayers({ q, guild: g, page }), null)
      : null;
  const pager = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (g) u.set("g", g);
    if (p > 0) u.set("p", String(p));
    const s = u.toString();
    return `/players${s ? `?${s}` : ""}`;
  };
  const tabClass = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
      on ? "bg-brand-600 text-on-brand" : "border-line hover:bg-brand-50 border"
    }`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="eyebrow">Сообщество</p>
      <h1 className="mt-2 text-[clamp(1.9rem,5vw,2.8rem)] leading-tight">
        Игроки
      </h1>
      <p className="text-ink-muted mt-2">
        Подтверждённые участники MineOrt. Что показывать о себе, каждый решает
        сам.
      </p>

      {guildsOn && (
        <nav
          aria-label="Раздел"
          className="mt-5 flex flex-wrap items-center gap-2"
        >
          <Link
            href="/players"
            aria-current={tab === "players" ? "page" : undefined}
            className={tabClass(tab === "players")}
          >
            Игроки
          </Link>
          <Link
            href="/players?tab=guilds"
            aria-current={tab === "guilds" ? "page" : undefined}
            className={tabClass(tab === "guilds")}
          >
            Гильдии
          </Link>
        </nav>
      )}

      <div className="mt-5 flex flex-col gap-4">
        <Notice error={sp.error} ok={sp.ok} />

        {tab === "guilds" ? (
          guilds.length === 0 ? (
            <EmptyState
              title="Гильдий пока нет"
              description="Их создаёт администрация, когда есть кому возглавить."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {guilds.map((gu) => (
                <li key={gu.slug}>
                  <Link
                    href={`/guilds/${gu.slug}`}
                    className="border-line bg-surface hover:bg-brand-50 lift flex h-full flex-col gap-2 rounded-2xl border p-4"
                  >
                    <span className="flex items-center gap-2">
                      <GuildTag tag={gu.tag} color={gu.color} />
                      <span className="font-pixel text-lg">{gu.name}</span>
                    </span>
                    {gu.description && (
                      <span className="text-ink-muted line-clamp-2 text-sm">
                        {gu.description}
                      </span>
                    )}
                    <span className="text-ink-muted mt-auto text-xs">
                      Участников: {gu.member_count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <form
              role="search"
              className="flex flex-wrap items-end gap-3"
              action="/players"
            >
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <label htmlFor="q" className="text-sm font-medium">
                  Ник
                </label>
                <input
                  id="q"
                  name="q"
                  defaultValue={q}
                  maxLength={32}
                  className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                />
              </div>
              {guildsOn && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="g" className="text-sm font-medium">
                    Гильдия
                  </label>
                  <select
                    id="g"
                    name="g"
                    defaultValue={g}
                    className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                  >
                    <option value="">Все</option>
                    <option value="none">Без гильдии</option>
                    {guilds.map((gu) => (
                      <option key={gu.slug} value={gu.slug}>
                        {gu.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="submit"
                className="bg-brand-600 text-on-brand min-h-11 rounded-full px-6 font-semibold"
              >
                Найти
              </button>
            </form>

            {result === null ? (
              <ErrorState
                title="Не удалось загрузить список игроков"
                description="Обновите страницу через минуту."
              />
            ) : result.players.length === 0 ? (
              <EmptyState
                title="Игроков по выбранным условиям не найдено"
                description="Попробуйте другой ник или сбросьте фильтр."
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result.players.map((p) => (
                  <li key={p.nickname}>
                    <PlayerCard p={p} back={pager(page)} />
                  </li>
                ))}
              </ul>
            )}

            {result && (page > 0 || result.hasMore) && (
              <div className="flex items-center justify-between">
                {page > 0 ? (
                  <Link
                    href={pager(page - 1)}
                    className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
                  >
                    ← Назад
                  </Link>
                ) : (
                  <span />
                )}
                {result.hasMore && (
                  <Link
                    href={pager(page + 1)}
                    className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
                  >
                    Дальше →
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
