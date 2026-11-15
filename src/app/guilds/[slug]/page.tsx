import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  leaveGuildAction,
  requestJoinAction,
  withdrawRequestAction,
} from "@/app/actions/guilds";
import { GuildTag } from "@/components/guilds/guild-tag";
import { PlayerCard } from "@/components/guilds/player-card";
import { PendingButton } from "@/components/social/pending-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/states";
import { requireFlag } from "@/lib/flags";
import {
  capsFor,
  getGuildInternal,
  getMyGuild,
  getPublicGuild,
  listRoster,
} from "@/lib/guilds/store";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/guilds/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const g = await getPublicGuild(slug).catch(() => null);
  return { title: g?.name ?? "Гильдия" };
}

const OK_TEXTS = {
  requested: "Заявка отправлена. Руководство гильдии рассмотрит её.",
  withdrawn: "Заявка отозвана.",
};

export default async function GuildPage({
  params,
  searchParams,
}: PageProps<"/guilds/[slug]">) {
  await requireFlag("ff_p1b_guilds");
  const { slug } = await params;
  const sp = await searchParams;
  const guild = await getPublicGuild(slug);
  if (!guild) notFound();
  const archived = guild.status === "archived";
  const [roster, internal, viewer] = await Promise.all([
    archived ? Promise.resolve([]) : listRoster(slug),
    getGuildInternal(slug),
    getViewer(),
  ]);
  const mine = viewer.userId ? await getMyGuild(viewer.userId) : null;
  const here = mine?.guild?.slug === slug ? mine.guild : null;
  const caps = here ? capsFor(here.level) : null;
  const myRequest = mine?.requests.find((r) => r.guild.slug === slug) ?? null;
  const canJoin =
    !archived && viewer.cls === "member" && !mine?.guild && !myRequest;
  const back = `/guilds/${slug}`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <p>
        <Link
          href="/players?tab=guilds"
          className="text-brand-700 text-sm font-semibold underline underline-offset-4"
        >
          ← Все гильдии
        </Link>
      </p>
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <GuildTag tag={guild.tag} color={guild.color} className="text-base" />
          <h1 className="text-[clamp(1.8rem,5vw,2.6rem)] leading-tight break-words">
            {guild.name}
          </h1>
        </div>
        {guild.description && (
          <p className="text-ink-muted mt-3 max-w-2xl break-words whitespace-pre-line">
            {guild.description}
          </p>
        )}
        <p className="text-ink-muted mt-2 text-sm">
          Участников: {guild.member_count}
          {internal && !archived && ` из ${internal.max_members}`}
        </p>
      </header>

      <div className="mt-5 flex flex-col gap-4">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />

        {archived && (
          <p
            role="status"
            className="bg-warn-bg text-warn rounded-2xl px-4 py-3 font-medium"
          >
            Гильдия распущена. Здесь осталась только публичная история.
          </p>
        )}

        {!archived && here && caps && (
          <Card className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm">
              Вы в этой гильдии: <strong>{here.rankName}</strong>
            </p>
            {caps.isLeader && internal?.needs_owner && (
              <span className="text-warn text-sm font-medium">
                Нужен глава: обратитесь к администрации.
              </span>
            )}
            {caps.isLeader && (
              <ButtonLink
                href={`/guilds/${slug}/manage`}
                className="min-h-11 px-5 text-sm"
              >
                Управление
              </ButtonLink>
            )}
            <form action={leaveGuildAction}>
              <input type="hidden" name="return_to" value="/dashboard" />
              <PendingButton
                variant="secondary"
                className="min-h-11 px-5 text-sm"
                pendingText="Выходим…"
              >
                Покинуть гильдию
              </PendingButton>
            </form>
            {here.level === 1 && (
              <p className="text-ink-muted w-full text-xs">
                Глава не может уйти сам: главенство передаёт администратор.
              </p>
            )}
          </Card>
        )}

        {canJoin && (
          <Card>
            <details>
              <summary className="text-brand-700 min-h-11 cursor-pointer py-2 font-semibold">
                Вступить в гильдию
              </summary>
              <form
                action={requestJoinAction}
                className="mt-3 flex flex-col gap-3"
              >
                <input type="hidden" name="guild_id" value={internal?.id} />
                <input type="hidden" name="return_to" value={back} />
                <label htmlFor="msg" className="text-sm font-medium">
                  Пара слов о себе (необязательно)
                </label>
                <textarea
                  id="msg"
                  name="message"
                  rows={3}
                  maxLength={280}
                  className="bg-paper text-ink border-line rounded-xl border px-3 py-2"
                />
                <PendingButton className="self-start" pendingText="Отправляем…">
                  Отправить заявку
                </PendingButton>
              </form>
            </details>
          </Card>
        )}
        {myRequest && (
          <Card className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm">Ваша заявка на рассмотрении.</p>
            <form action={withdrawRequestAction}>
              <input type="hidden" name="request_id" value={myRequest.id} />
              <input type="hidden" name="return_to" value={back} />
              <PendingButton
                variant="ghost"
                className="min-h-11 px-4 text-sm"
                pendingText="Отзываем…"
              >
                Отозвать заявку
              </PendingButton>
            </form>
          </Card>
        )}

        <section aria-labelledby="roster" className="mt-2">
          <h2 id="roster" className="text-2xl">
            Состав
          </h2>
          {archived ? null : roster.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="Состав пока не опубликован"
                description="Игроки сами решают, показывать ли им свою гильдию."
              />
            </div>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {roster.map((p) => (
                <li key={p.nickname}>
                  <PlayerCard p={p} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
