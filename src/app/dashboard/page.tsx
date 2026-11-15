import type { Metadata } from "next";
import Link from "next/link";
import { getAccessOverview, getTelegramBinding } from "@/lib/access/store";
import { requireUser } from "@/lib/auth/guards";
import { getWhitelistState } from "@/lib/bridge/whitelist";
import {
  applicationLine,
  identityLine,
  membershipLine,
  whitelistLine,
} from "@/lib/dashboard/lines";
import { getSettings } from "@/lib/guides/store";
import { CAN_CONNECT } from "@/lib/onboarding/stage";
import { getStageForUser } from "@/lib/onboarding/server";
import { safely } from "@/lib/safe";
import { isEnabled } from "@/lib/flags";
import { getPublicServerInfo } from "@/lib/site/server-status";
import { DashboardGuild } from "@/components/guilds/dashboard-guild";
import { PrivacyForm } from "@/components/guilds/privacy-form";
import { getMyGuild, getPrivacy } from "@/lib/guilds/store";
import { nextEvent } from "@/lib/social/events";
import { nextOpenPoll } from "@/lib/social/polls";
import { latestNews } from "@/lib/social/store";
import { getViewer } from "@/lib/social/viewer";
import { DashboardView } from "@/components/portal/dashboard-view";
import { portalItems } from "@/components/portal/portal-nav";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Мой MineOrt" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  const sp = await searchParams;
  const social = isEnabled("ff_p1b_social");
  const viewer = social ? await getViewer() : null;
  const event = viewer
    ? await safely("dashboard event", () => nextEvent(viewer), null)
    : null;
  const poll = social
    ? await safely("dashboard poll", () => nextOpenPoll(user.userId), null)
    : null;
  const guildsOn = isEnabled("ff_p1b_guilds");
  const myGuild = guildsOn
    ? await safely("my guild", () => getMyGuild(user.userId), null)
    : null;
  const privacy = isEnabled("ff_p1a")
    ? await safely("privacy", () => getPrivacy(user.userId), null)
    : null;
  const news = isEnabled("ff_p1a")
    ? await safely("dashboard news", () => latestNews(4), [])
    : [];
  const [o, wl, tg, settings, st, info] = await Promise.all([
    getAccessOverview(user.userId),
    getWhitelistState(user.userId),
    getTelegramBinding(user.userId),
    getSettings(),
    getStageForUser(user.userId),
    safely("server info", getPublicServerInfo, {
      status: "unknown" as const,
      players: null,
      maxPlayers: null,
      version: null,
    }),
  ]);

  const confirmed = o.identity?.binding_status === "confirmed";
  const canConnect = CAN_CONNECT.has(st.stage);

  return (
    <>
      {(sp.error || sp.ok) && (
        <div className="mx-4 mt-2 sm:mx-8">
          <Notice
            error={sp.error}
            ok={sp.ok}
            okTexts={{
              joined: "Вы вступили в гильдию.",
              declined: "Приглашение отклонено.",
              left: "Вы покинули гильдию.",
              approved: "Игрок принят в гильдию.",
              rejected: "Заявка отклонена.",
              rank: "Ранг изменён.",
              kicked: "Участник исключён.",
              invited: "Приглашение отправлено.",
              privacy: "Настройки публичности сохранены.",
            }}
          />
        </div>
      )}
      <DashboardView
        nick={o.identity?.nickname ?? null}
        stage={st.stage}
        telegramUsername={tg?.username ?? null}
        minecraftConfirmed={confirmed}
        statuses={[
          { title: "Заявка", line: applicationLine(o.application?.status) },
          { title: "Допуск", line: membershipLine(o.membership?.status) },
          { title: "Доступ на сервере", line: whitelistLine(wl) },
          { title: "Личность в игре", line: identityLine(confirmed) },
        ]}
        rejectedReason={
          o.application?.status === "rejected"
            ? o.application.decision_reason
            : null
        }
        server={{
          status: info.status,
          players: info.players,
          maxPlayers: info.maxPlayers,
          version: settings.minecraft_version || info.version || undefined,
          address: settings.server_address || null,
        }}
        canConnect={canConnect}
        stats={{}}
        event={
          event
            ? {
                title: event.title,
                startsAt: event.startsAt,
                place: event.place || "Место уточняется",
                participants: event.attendees,
                joined: event.joined,
                coverSrc: "/art/house.svg",
                href: `/social/calendar#e-${event.id}`,
              }
            : null
        }
        projects={[]}
        vote={poll ? { ...poll, href: "/social/polls" } : null}
        feed={news.map((n) => ({
          kind: "Новость",
          title: n.body.length > 90 ? `${n.body.slice(0, 90)}…` : n.body,
          when: new Date(n.created_at).toLocaleDateString("ru-RU"),
          href: "/social?f=news",
        }))}
        guildBlock={
          myGuild && (
            <DashboardGuild
              guild={myGuild.guild}
              invitations={myGuild.invitations}
            />
          )
        }
        privacyBlock={privacy && <PrivacyForm value={privacy} />}
        botConnected={false}
        canInvite={user.site_role === "admin"}
        supportContact={settings.support_contact || null}
        nav={portalItems("/dashboard")}
        settings={{ rulesAccepted: o.rulesAccepted }}
        accountActions={
          <>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="text-brand-700 min-h-11 underline underline-offset-4"
              >
                Выйти
              </button>
            </form>
            <Link
              href="/dashboard/delete"
              className="text-danger min-h-11 py-2 underline underline-offset-4"
            >
              Удалить аккаунт
            </Link>
          </>
        }
      />
    </>
  );
}
