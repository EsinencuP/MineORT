import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  assignRankAction,
  editGuildProfileAction,
  decideRequestAction,
  inviteMemberAction,
  kickMemberAction,
} from "@/app/actions/guilds";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/guards";
import { requireFlag } from "@/lib/flags";
import {
  capsFor,
  getGuildInternal,
  getManageData,
  levelInGuild,
} from "@/lib/guilds/store";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Управление гильдией" };

const OK_TEXTS = {
  rank: "Ранг изменён.",
  kicked: "Участник исключён.",
  invited: "Приглашение отправлено.",
  approved: "Игрок принят в гильдию.",
  rejected: "Заявка отклонена.",
  profile: "Описание гильдии сохранено.",
};

export default async function ManageGuildPage({
  params,
  searchParams,
}: PageProps<"/guilds/[slug]/manage">) {
  await requireFlag("ff_p1b_guilds");
  const { slug } = await params;
  const user = await requireUser(`/guilds/${slug}/manage`);
  const guild = await getGuildInternal(slug);
  if (!guild) notFound();
  // rights come from the database on every request, never from a token or the page state
  const level = await levelInGuild(guild.id, user.userId);
  if (level === null || level > 5 || guild.status !== "active") notFound();
  const caps = capsFor(level);
  const sp = await searchParams;
  const data = await getManageData(guild.id);
  const back = `/guilds/${slug}/manage`;
  const allowedRanks = data.ranks.filter(
    (r) => r.level > level && (r.level !== 2 || caps.canMakeVice),
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <Breadcrumbs
        items={[
          { label: "Игроки", href: "/players" },
          { label: "Гильдии", href: "/players?tab=guilds" },
          { label: guild.name, href: `/guilds/${slug}` },
          { label: "Управление" },
        ]}
      />
      <h1 className="mt-3 text-[clamp(1.8rem,5vw,2.6rem)] leading-tight">
        Управление гильдией
      </h1>
      <p className="text-ink-muted mt-2 text-sm">
        Права читаются из базы при каждом действии. Ваш ранг:{" "}
        {data.ranks.find((r) => r.level === level)?.name}.
      </p>

      <div className="mt-5 flex flex-col gap-6">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />

        <section aria-labelledby="about" className="flex flex-col gap-3">
          <h2 id="about" className="text-2xl">
            Описание
          </h2>
          <Card>
            <form
              action={editGuildProfileAction}
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="guild_id" value={guild.id} />
              <input type="hidden" name="return_to" value={back} />
              <label htmlFor="g-about" className="text-sm font-medium">
                Что видят гости на странице гильдии (до 1000 символов)
              </label>
              <textarea
                id="g-about"
                name="description"
                rows={4}
                maxLength={1000}
                defaultValue={guild.description}
                className="bg-paper text-ink border-line rounded-xl border px-3 py-2"
              />
              <PendingButton className="self-start" pendingText="Сохраняем…">
                Сохранить описание
              </PendingButton>
            </form>
          </Card>
        </section>

        <section aria-labelledby="members" className="flex flex-col gap-3">
          <h2 id="members" className="text-2xl">
            Участники
          </h2>
          <ul className="flex flex-col gap-2">
            {data.members.map((m) => {
              const below = m.level > level;
              return (
                <li key={m.userId}>
                  <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{m.nick}</p>
                      <p className="text-ink-muted text-xs">{m.rankName}</p>
                    </div>
                    {below && caps.canAssign && allowedRanks.length > 0 && (
                      <form
                        action={assignRankAction}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="guild_id" value={guild.id} />
                        <input type="hidden" name="target" value={m.userId} />
                        <input type="hidden" name="return_to" value={back} />
                        <label className="sr-only" htmlFor={`r-${m.userId}`}>
                          Новый ранг для {m.nick}
                        </label>
                        <select
                          id={`r-${m.userId}`}
                          name="level"
                          defaultValue={m.level}
                          className="bg-paper text-ink border-line min-h-11 rounded-xl border px-2 text-sm"
                        >
                          {allowedRanks.map((r) => (
                            <option key={r.level} value={r.level}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <PendingButton
                          variant="secondary"
                          className="min-h-11 px-4 text-sm"
                          pendingText="Сохраняем…"
                        >
                          Назначить
                        </PendingButton>
                      </form>
                    )}
                    {below && caps.canKick && (
                      <details className="relative">
                        <summary className="text-danger hover:bg-danger-bg flex min-h-11 cursor-pointer list-none items-center rounded-full px-3 text-sm font-semibold">
                          Исключить
                        </summary>
                        <form
                          action={kickMemberAction}
                          className="border-line bg-paper absolute right-0 z-10 mt-1 flex w-64 flex-col gap-2 rounded-2xl border p-3 shadow-[var(--shadow-card)]"
                        >
                          <input
                            type="hidden"
                            name="guild_id"
                            value={guild.id}
                          />
                          <input type="hidden" name="target" value={m.userId} />
                          <input type="hidden" name="return_to" value={back} />
                          <label
                            className="text-sm font-medium"
                            htmlFor={`k-${m.userId}`}
                          >
                            Причина
                          </label>
                          <input
                            id={`k-${m.userId}`}
                            name="reason"
                            maxLength={200}
                            className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm"
                          />
                          <PendingButton
                            variant="danger"
                            className="min-h-11 text-sm"
                            pendingText="Исключаем…"
                          >
                            Исключить игрока
                          </PendingButton>
                        </form>
                      </details>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="invite" className="flex flex-col gap-3">
          <h2 id="invite" className="text-2xl">
            Пригласить игрока
          </h2>
          <Card>
            <form
              action={inviteMemberAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="guild_id" value={guild.id} />
              <input type="hidden" name="return_to" value={back} />
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <label htmlFor="inv-nick" className="text-sm font-medium">
                  Ник игрока
                </label>
                <input
                  id="inv-nick"
                  name="nick"
                  required
                  maxLength={16}
                  className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                />
              </div>
              <PendingButton pendingText="Отправляем…">
                Пригласить
              </PendingButton>
            </form>
            <p className="text-ink-muted mt-3 text-xs">
              Приглашение действует 7 дней. Пригласить можно игрока с допуском,
              у которого нет гильдии.
            </p>
            {data.invitations.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {data.invitations.map((i) => (
                  <li key={i.id}>
                    {i.nick}{" "}
                    <span className="text-ink-muted">
                      · ждёт ответа до{" "}
                      {new Date(i.expiresAt).toLocaleDateString("ru-RU")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section aria-labelledby="requests" className="flex flex-col gap-3">
          <h2 id="requests" className="text-2xl">
            Заявки в гильдию
          </h2>
          {data.requests.length === 0 ? (
            <EmptyState title="Заявок нет" />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.requests.map((r) => (
                <li key={r.id}>
                  <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{r.nick}</p>
                      {r.message && (
                        <p className="text-ink-muted text-sm break-words">
                          {r.message}
                        </p>
                      )}
                    </div>
                    <form action={decideRequestAction} className="flex gap-2">
                      <input type="hidden" name="request_id" value={r.id} />
                      <input type="hidden" name="return_to" value={back} />
                      <PendingButton
                        className="min-h-11 px-4 text-sm"
                        name="decision"
                        value="approve"
                        pendingText="…"
                      >
                        Принять
                      </PendingButton>
                      <PendingButton
                        variant="ghost"
                        className="min-h-11 px-4 text-sm"
                        name="decision"
                        value="reject"
                        pendingText="…"
                      >
                        Отклонить
                      </PendingButton>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
