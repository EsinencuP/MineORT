import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuildTag } from "@/components/guilds/guild-tag";
import { MinecraftAvatar } from "@/components/portal/minecraft-avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireFlag } from "@/lib/flags";
import { getPlayerProfile, userIdByNick } from "@/lib/guilds/store";
import { isEnabled } from "@/lib/flags";
import { safely } from "@/lib/safe";
import { listPublicGallery } from "@/lib/social/gallery";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { safeBack } from "@/lib/nav/back";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/players/[nick]">): Promise<Metadata> {
  const { nick } = await params;
  return { title: nick };
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Chisinau",
  }).format(new Date(iso));

export default async function PlayerPage({
  params,
  searchParams,
}: PageProps<"/players/[nick]">) {
  await requireFlag("ff_p1a");
  const { nick } = await params;
  const listBack = safeBack((await searchParams).back, ["/players"]);
  const profile = await getPlayerProfile(nick);
  if (!profile) notFound(); // candidates, rejected, suspended and unknown nicks look the same
  const shots = isEnabled("ff_p1a")
    ? await safely(
        "profile gallery",
        () => listPublicGallery({ author: profile.nickname }, 6),
        null,
      )
    : null;
  const me = await getCurrentUser();
  const mine = me
    ? (await userIdByNick(profile.nickname)) === me.userId
    : false;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <Breadcrumbs
        items={[
          { label: "Игроки", href: "/players" },
          { label: profile.nickname },
        ]}
        back={
          listBack ? { href: listBack, label: "← К результатам" } : undefined
        }
      />
      <header className="mt-4 flex flex-wrap items-center gap-4">
        <MinecraftAvatar nick={profile.nickname} size={88} />
        <div className="min-w-0">
          <h1 className="text-[clamp(1.8rem,5vw,2.6rem)] leading-tight break-words">
            {profile.nickname}
          </h1>
          {profile.guild_slug && profile.guild_tag && profile.guild_color ? (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <GuildTag tag={profile.guild_tag} color={profile.guild_color} />
              <Link
                href={`/guilds/${profile.guild_slug}`}
                className="font-semibold underline underline-offset-4"
              >
                {profile.guild_name}
              </Link>
              <span className="text-ink-muted text-sm">
                · {profile.rank_name}
              </span>
            </p>
          ) : (
            <p className="text-ink-muted mt-2 text-sm">Без гильдии</p>
          )}
          {profile.since && (
            <p className="text-ink-muted mt-1 text-sm">
              В сообществе с {fmt(profile.since)}
            </p>
          )}
        </div>
      </header>

      {profile.bio && (
        <Card className="mt-6">
          <h2 className="text-xl">О себе</h2>
          <p className="mt-2 break-words whitespace-pre-line">{profile.bio}</p>
        </Card>
      )}

      {shots && shots.items.length > 0 && (
        <section aria-labelledby="shots" className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="shots" className="text-2xl">
              Скриншоты
            </h2>
            <Link
              href={`/social/gallery?author=${encodeURIComponent(profile.nickname)}`}
              className="text-brand-700 text-sm font-semibold underline underline-offset-4"
            >
              Все скриншоты игрока
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shots.items.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/social/gallery/${g.id}`}
                  className="border-line lift block overflow-hidden rounded-2xl border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/${g.id}`}
                    alt={g.caption || `Скриншот игрока ${g.owner}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="posts" className="mt-8">
        <h2 id="posts" className="text-2xl">
          Публикации
        </h2>
        {profile.posts.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Игрок пока ничего не опубликовал" />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {profile.posts.map((p) => (
              <li key={p.id}>
                <Card>
                  <p className="text-ink-muted text-xs">{fmt(p.createdAt)}</p>
                  <p className="mt-1 break-words whitespace-pre-line">
                    {p.body.length > 280 ? `${p.body.slice(0, 280)}…` : p.body}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mine && (
        <p className="mt-8">
          <Link
            href="/dashboard#privacy"
            className="text-brand-700 font-semibold underline underline-offset-4"
          >
            Настройки публичности
          </Link>
        </p>
      )}
    </div>
  );
}
