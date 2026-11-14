import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { ctaFor, type OnboardingStage } from "@/lib/onboarding/stage";
import {
  EventCard,
  FeedItem,
  NotifyCard,
  ProjectCard,
  QuickActions,
  ServerCard,
  StatCard,
  VoteCard,
  type EventCardProps,
  type ProjectCardProps,
  type ServerCardProps,
  type VoteCardProps,
} from "./cards";
import { MinecraftAvatar } from "./minecraft-avatar";
import { PortalNav, type PortalNavItem } from "./portal-nav";

export type Line = { tone: BadgeTone; text: string };

export type DashboardProps = {
  nick: string | null;
  stage: OnboardingStage;
  telegramUsername: string | null;
  minecraftConfirmed: boolean;
  /** The four honest status lines: application, admission, server access, identity in game. */
  statuses: { title: string; line: Line }[];
  rejectedReason?: string | null;
  server: ServerCardProps;
  /** True only when the whitelist entry is applied: the address and "ready" appear. */
  canConnect: boolean;
  stats: {
    playTime?: string | null;
    lastLogin?: string | null;
    projects?: string | null;
    events?: string | null;
    achievements?: string | null;
  };
  event: EventCardProps | null;
  projects: ProjectCardProps[];
  vote: (VoteCardProps & { results?: never }) | null;
  feed: { kind: string; title: string; when: string; href: string }[];
  botConnected: boolean;
  canInvite: boolean;
  supportContact?: string | null;
  nav: PortalNavItem[];
  settings: { rulesAccepted: boolean };
  /** Slot for the account actions (logout, delete) that need real forms. */
  accountActions?: ReactNode;
};

const iconCls = "size-5";
const MapIcon = (
  <svg
    viewBox="0 0 24 24"
    className={iconCls}
    fill="currentColor"
    aria-hidden="true"
    shapeRendering="crispEdges"
  >
    <path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zm7-.5v13l4 1.3v-13zM5 6.5v11l3 1v-11zm11 0v11l3-1v-11z" />
  </svg>
);
const BookIcon = (
  <svg
    viewBox="0 0 24 24"
    className={iconCls}
    fill="currentColor"
    aria-hidden="true"
    shapeRendering="crispEdges"
  >
    <path d="M4 3h16v16H7v2H4zm4 3v2h8V6zm0 4v2h8v-2z" />
  </svg>
);
const PlusIcon = (
  <svg
    viewBox="0 0 24 24"
    className={iconCls}
    fill="currentColor"
    aria-hidden="true"
    shapeRendering="crispEdges"
  >
    <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />
  </svg>
);
const CalIcon = (
  <svg
    viewBox="0 0 24 24"
    className={iconCls}
    fill="currentColor"
    aria-hidden="true"
    shapeRendering="crispEdges"
  >
    <path d="M6 3h2v2h8V3h2v2h3v16H3V5h3zm-1 6v10h14V9z" />
  </svg>
);
const UserPlusIcon = (
  <svg
    viewBox="0 0 24 24"
    className={iconCls}
    fill="currentColor"
    aria-hidden="true"
    shapeRendering="crispEdges"
  >
    <path d="M8 4h6v6H8zM3 20v-4h12v4zm14-10h2v2h2v2h-2v2h-2v-2h-2v-2h2z" />
  </svg>
);

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mb-3 text-xl sm:text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-line rounded-2xl border border-dashed p-5">
      <p className="font-semibold">{title}</p>
      <p className="text-ink-muted mt-1 text-sm">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Which blocks matter first depends on where the player is. */
function PriorityCard({
  stage,
  supportContact,
}: {
  stage: OnboardingStage;
  supportContact?: string | null;
}) {
  const cta = ctaFor(stage);
  const copy: Partial<
    Record<OnboardingStage, { title: string; text: string }>
  > = {
    needs_rules: {
      title: "Заверши регистрацию",
      text: "Укажи ник и получи доступ на сервер. Это займёт пару минут.",
    },
    needs_nick: {
      title: "Заверши регистрацию",
      text: "Укажи ник и получи доступ на сервер. Это займёт пару минут.",
    },
    needs_access: {
      title: "Начни своё приключение",
      text: "Осталось получить доступ: по приглашению или заявкой.",
    },
    application_pending: {
      title: "Заявка на рассмотрении",
      text: "Администрация рассмотрит её. Пока можно почитать Гайдбук: готового доступа на сервер ещё нет.",
    },
    application_rejected: {
      title: "Заявка отклонена",
      text: "Подробности и дату новой попытки смотри в мастере подключения.",
    },
    access_preparing: {
      title: "Доступ подготавливается",
      text: "Сервер ещё не подтвердил твой допуск. Адрес появится здесь, когда всё будет готово.",
    },
    ready_to_install: {
      title: "Можно подключаться!",
      text: "Установи игру, зайди на сервер и подтвердим, что ник твой: понадобится код из игры.",
    },
    first_login_pending: {
      title: "Подтверди первый вход",
      text: "Введи одноразовый код из игры, чтобы подтвердить ник.",
    },
    restricted: {
      title: "Доступ ограничен",
      text: supportContact
        ? `Игровые шаги недоступны. Связь с администрацией: ${supportContact}.`
        : "Игровые шаги недоступны. Свяжитесь с администрацией.",
    },
  };
  const c = copy[stage];
  if (!c) return null;
  return (
    <Card
      className="border-brand-500/50 mt-6 flex flex-wrap items-center justify-between gap-4"
      role="status"
    >
      <div className="max-w-xl">
        <p className="eyebrow">Что сейчас важно</p>
        <h2 className="mt-1 text-2xl">{c.title}</h2>
        <p className="text-ink-muted mt-1 text-sm">{c.text}</p>
      </div>
      {stage !== "restricted" && (
        <ButtonLink
          href={
            stage === "application_pending" ||
            stage === "application_rejected" ||
            stage.startsWith("needs")
              ? "/onboarding/minecraft"
              : cta.href
          }
        >
          {stage.startsWith("needs") ? "Продолжить" : cta.label}
        </ButtonLink>
      )}
    </Card>
  );
}

export function DashboardView(p: DashboardProps) {
  const newbie = ["needs_rules", "needs_nick", "needs_access"].includes(
    p.stage,
  );
  const greeting = p.nick ? `С возвращением, ${p.nick}!` : "Добро пожаловать!";

  return (
    <div className="pb-4">
      <PortalNav items={p.nav} nick={p.nick} />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        {/* welcome */}
        <header className="flex flex-wrap items-center gap-4">
          <MinecraftAvatar nick={p.nick} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[clamp(1.7rem,4.5vw,2.6rem)] leading-tight">
              {newbie ? "Мой MineOrt" : greeting}
            </h1>
            <p className="text-ink-muted mt-1">
              {newbie
                ? "Начни своё приключение: вот что нужно сделать."
                : "Вот что происходит в мире MineOrt."}
            </p>
            <p className="mt-3 flex flex-wrap gap-2">
              <StatusBadge
                tone={p.telegramUsername !== undefined ? "ok" : "neutral"}
              >
                Telegram
                {p.telegramUsername ? ` · @${p.telegramUsername}` : " привязан"}
              </StatusBadge>
              <StatusBadge
                tone={p.minecraftConfirmed ? "ok" : p.nick ? "info" : "neutral"}
              >
                {p.minecraftConfirmed
                  ? `Minecraft · ${p.nick}`
                  : p.nick
                    ? `Minecraft · ${p.nick} (подтвердим в игре)`
                    : "Minecraft не указан"}
              </StatusBadge>
            </p>
          </div>
        </header>

        <PriorityCard stage={p.stage} supportContact={p.supportContact} />

        {/* server + access */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ServerCard
            {...p.server}
            address={p.canConnect ? p.server.address : null}
          />
          <Card aria-label="Мой доступ" className="flex flex-col gap-4">
            <h2 className="text-xl">Мой доступ</h2>
            <dl className="flex flex-col gap-3">
              {p.statuses.map((r) => (
                <div
                  key={r.title}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <dt className="text-ink-muted min-w-36 text-sm">{r.title}</dt>
                  <dd>
                    <StatusBadge tone={r.line.tone}>{r.line.text}</StatusBadge>
                  </dd>
                </div>
              ))}
            </dl>
            {p.rejectedReason && (
              <p className="text-sm">Причина отклонения: {p.rejectedReason}</p>
            )}
            {p.canConnect && (
              <Link
                href="/start"
                className="text-brand-700 text-sm font-semibold underline underline-offset-4"
              >
                Инструкция по установке и подключению
              </Link>
            )}
          </Card>
        </div>

        {/* statistics */}
        <Section title="Моя статистика" id="stats">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard
              label="Время в игре"
              value={p.stats.playTime}
              hint="Появится после первого входа"
            />
            <StatCard
              label="Последний вход"
              value={p.stats.lastLogin}
              hint="Пока не заходил"
            />
            <StatCard
              label="Проекты"
              value={p.stats.projects}
              hint="Присоединись к первому"
            />
            <StatCard
              label="События"
              value={p.stats.events}
              hint="Пока нет посещений"
            />
            <StatCard
              label="Достижения"
              value={p.stats.achievements}
              hint="Скоро: награды сообщества"
            />
          </div>
        </Section>

        {/* event + vote */}
        <Section title="Ближайшее" id="soon">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {p.event ? (
              <EventCard {...p.event} />
            ) : (
              <Empty
                title="Ближайших событий пока нет"
                text="Когда появится ивент, ты увидишь его здесь и сможешь записаться."
              />
            )}
            {p.vote ? (
              <VoteCard {...p.vote} />
            ) : (
              <Empty
                title="Активных голосований нет"
                text="Новые голосования сообщества будут появляться здесь."
              />
            )}
          </div>
        </Section>

        {/* projects */}
        <Section title="Мои проекты" id="projects">
          {p.projects.length > 0 ? (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              {p.projects.map((pr) => (
                <li key={pr.title}>
                  <ProjectCard {...pr} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="Ты пока не участвуешь в проектах"
              text="Общие стройки сообщества появятся в следующем обновлении. Здесь будет видно твою роль и прогресс."
            />
          )}
        </Section>

        {/* feed + notifications */}
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card aria-label="Новости сообщества">
            <h2 className="text-xl">Новости и активность</h2>
            {p.feed.length > 0 ? (
              <ul className="mt-3">
                {p.feed.map((f) => (
                  <FeedItem key={f.title} {...f} />
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted mt-3 text-sm">
                Пока тихо. Новости сервера, постройки и результаты голосований
                появятся здесь.
              </p>
            )}
          </Card>
          <NotifyCard connected={p.botConnected} />
        </div>

        {/* quick actions */}
        <Section title="Быстрые действия" id="quick">
          <QuickActions
            items={[
              {
                label: "Открыть карту",
                href: "/map",
                icon: MapIcon,
                ...(p.nav.find((n) => n.label === "Карта мира")?.href
                  ? {}
                  : { disabledHint: "Скоро" }),
              },
              { label: "Читать Гайдбук", href: "/guide", icon: BookIcon },
              {
                label: "Создать проект",
                href: "",
                icon: PlusIcon,
                disabledHint: "Скоро",
              },
              {
                label: "Посмотреть события",
                href: "/social/calendar",
                icon: CalIcon,
                ...(p.nav.find((n) => n.label === "События")?.href
                  ? {}
                  : { disabledHint: "Скоро" }),
              },
              ...(p.canInvite
                ? [
                    {
                      label: "Пригласить друга",
                      href: "/admin/invitations",
                      icon: UserPlusIcon,
                    },
                  ]
                : []),
            ]}
          />
        </Section>

        {/* settings */}
        <Section title="Настройки и привязки" id="settings">
          <Card className="flex flex-col gap-2 text-sm">
            <p>
              Telegram:{" "}
              <strong>
                {p.telegramUsername ? `@${p.telegramUsername}` : "привязан"}
              </strong>
            </p>
            <p>
              Ник в Minecraft: <strong>{p.nick ?? "не указан"}</strong>
            </p>
            <p>
              Правила: {p.settings.rulesAccepted ? "приняты" : "не приняты"}
            </p>
            {p.accountActions && (
              <div className="mt-2 flex flex-wrap items-center gap-6">
                {p.accountActions}
              </div>
            )}
          </Card>
        </Section>
      </div>
    </div>
  );
}
