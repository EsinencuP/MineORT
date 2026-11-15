import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { previewAllowed } from "@/lib/design-preview";
import {
  applicationLine,
  identityLine,
  membershipLine,
  whitelistLine,
} from "@/lib/dashboard/lines";
import type { OnboardingStage } from "@/lib/onboarding/stage";
import {
  DashboardView,
  type DashboardProps,
} from "@/components/portal/dashboard-view";
import { LoginView, type LoginError } from "@/components/portal/login-view";
import {
  OnboardingView,
  type OnboardingProps,
} from "@/components/portal/onboarding-view";
import { portalItems } from "@/components/portal/portal-nav";

export const metadata: Metadata = { title: "Макет состояния" };

const inDays = (d: number, hours = 0) =>
  new Date(Date.now() + d * 86_400_000 + hours * 3_600_000).toISOString();

/* ---------- onboarding ---------- */
const baseOnboarding: OnboardingProps = {
  profile: { name: "Алексей", username: "alex_builder" },
  nick: null,
  nickLocked: false,
  rulesAccepted: false,
  invitePrefill: null,
  application: null,
  viaInvitation: false,
  membershipApproved: false,
  whitelistApplied: false,
  error: null,
  ok: null,
  preview: true,
};

const onboarding: Record<string, OnboardingProps> = {
  empty: { ...baseOnboarding },
  filled: { ...baseOnboarding, previewNick: "Steve_01" },
  invite: {
    ...baseOnboarding,
    nick: "Steve_01",
    invitePrefill: "k3M9x2LqP7aB4vTn",
  },
  application: { ...baseOnboarding, nick: "Steve_01", openApplication: true },
  taken: { ...baseOnboarding, previewNick: "Notch", error: "nick_taken" },
  pending: {
    ...baseOnboarding,
    nick: "Steve_01",
    rulesAccepted: true,
    application: { status: "pending" },
  },
  syncing: {
    ...baseOnboarding,
    nick: "Steve_01",
    rulesAccepted: true,
    membershipApproved: true,
    nickLocked: true,
    serverState: "unknown",
    application: { status: "approved" },
  },
  ready: {
    ...baseOnboarding,
    nick: "Steve_01",
    rulesAccepted: true,
    membershipApproved: true,
    whitelistApplied: true,
    nickLocked: true,
    application: { status: "approved" },
  },
  rejected: {
    ...baseOnboarding,
    nick: "Steve_01",
    rulesAccepted: true,
    application: {
      status: "rejected",
      reason: "Не хватает информации о себе",
      retryOn: new Date(Date.now() + 5 * 86_400_000).toLocaleDateString(
        "ru-RU",
      ),
    },
    supportContact: "@mineort_admin",
  },
};

/* ---------- dashboard ---------- */
const server = {
  status: "online" as const,
  players: 8,
  maxPlayers: 40,
  version: "Paper 26.3",
  address: "play.mineort.example",
};
const nav = portalItems();

function dash(
  over: Partial<DashboardProps> & { stage: OnboardingStage },
): DashboardProps {
  return {
    nick: "Steve_01",
    telegramUsername: "alex_builder",
    minecraftConfirmed: false,
    statuses: [
      { title: "Заявка", line: applicationLine(undefined) },
      { title: "Допуск", line: membershipLine(undefined) },
      { title: "Доступ на сервере", line: whitelistLine(null) },
      { title: "Личность в игре", line: identityLine(false) },
    ],
    server,
    canConnect: false,
    stats: {},
    event: null,
    projects: [],
    vote: null,
    feed: [],
    botConnected: false,
    canInvite: false,
    supportContact: "@mineort_admin",
    nav,
    settings: { rulesAccepted: true },
    ...over,
  };
}

const activeData: Partial<DashboardProps> = {
  minecraftConfirmed: true,
  canConnect: true,
  canInvite: true,
  botConnected: true,
  statuses: [
    { title: "Заявка", line: applicationLine("approved") },
    { title: "Допуск", line: membershipLine("approved") },
    {
      title: "Доступ на сервере",
      line: whitelistLine({ desired: "on", applied_state: "applied" }),
    },
    { title: "Личность в игре", line: identityLine(true) },
  ],
  stats: {
    playTime: "42 ч 15 мин",
    lastLogin: "вчера, 21:40",
    projects: "2 проекта",
    events: "5 событий",
    achievements: "7 из 24",
  },
  event: {
    title: "Большая стройка: ночной рынок",
    startsAt: inDays(2, 3),
    place: "Спавн, площадь Ветров",
    participants: 14,
    joined: false,
    coverSrc: "/art/house.webp",
  },
  projects: [
    {
      title: "Центральная железная дорога",
      description: "Магистраль между тремя городами.",
      progress: 68,
      progressLabel: "Собрано ресурсов",
      role: "Строитель",
      next: "Принести 3 стака железа",
      coverSrc: "/art/meadow.webp",
    },
    {
      title: "Вишнёвый сад",
      description: "Общественный парк у озера.",
      progress: 35,
      progressLabel: "Готовность",
      role: "Ландшафт",
      next: "Посадить деревья на южном берегу",
      coverSrc: "/art/cherry.webp",
    },
  ],
  vote: {
    question: "Какой общественный проект построим следующим?",
    endsAt: inDays(1, 6),
    voted: false,
    participants: 23,
  },
  feed: [
    {
      kind: "Постройка",
      title: "Открыта общественная библиотека",
      when: "сегодня",
      href: "/dashboard",
    },
    {
      kind: "Анонс",
      title: "В субботу большая стройка",
      when: "вчера",
      href: "/dashboard",
    },
    {
      kind: "Голосование",
      title: "Выбрали название для столицы: Эверглейд",
      when: "3 дня назад",
      href: "/dashboard",
    },
    {
      kind: "Проект завершён",
      title: "Мост через ущелье готов",
      when: "неделю назад",
      href: "/dashboard",
    },
  ],
};

const dashboard: Record<string, DashboardProps> = {
  new: dash({
    stage: "needs_nick",
    nick: null,
    settings: { rulesAccepted: false },
  }),
  pending: dash({
    stage: "application_pending",
    statuses: [
      { title: "Заявка", line: applicationLine("pending") },
      { title: "Допуск", line: membershipLine("pending") },
      { title: "Доступ на сервере", line: whitelistLine(null) },
      { title: "Личность в игре", line: identityLine(false) },
    ],
  }),
  preparing: dash({
    stage: "access_preparing",
    statuses: [
      { title: "Заявка", line: applicationLine("approved") },
      { title: "Допуск", line: membershipLine("approved") },
      {
        title: "Доступ на сервере",
        line: whitelistLine({ desired: "on", applied_state: "pending" }),
      },
      { title: "Личность в игре", line: identityLine(false) },
    ],
  }),
  ready: dash({
    stage: "ready_to_install",
    canConnect: true,
    statuses: [
      { title: "Заявка", line: applicationLine("approved") },
      { title: "Допуск", line: membershipLine("approved") },
      {
        title: "Доступ на сервере",
        line: whitelistLine({ desired: "on", applied_state: "applied" }),
      },
      { title: "Личность в игре", line: identityLine(false) },
    ],
  }),
  active: dash({ stage: "active", ...activeData }),
  offline: dash({
    stage: "active",
    ...activeData,
    server: {
      status: "offline",
      players: null,
      maxPlayers: null,
      version: "Paper 26.3",
      address: "play.mineort.example",
    },
  }),
};

const loginStates: Record<
  string,
  { error?: LoginError; detail?: string; loading?: boolean }
> = {
  default: {},
  loading: { loading: true },
  cancelled: { error: "cancelled" },
  error: { error: "invalid" },
  blocked: {
    error: "blocked",
    detail:
      "Причина: нарушение правил. Действует до 12.12.2026. Связь с администрацией: @mineort_admin.",
  },
};

export default async function DesignState({
  params,
}: PageProps<"/design/[screen]/[state]">) {
  if (!previewAllowed()) notFound();
  const { screen, state } = await params;

  let body: React.ReactNode = null;
  if (screen === "login" && loginStates[state]) {
    const s = loginStates[state];
    body = (
      <LoginView
        href="/login"
        error={s.error}
        detail={s.detail}
        startLoading={s.loading}
      />
    );
  } else if (screen === "onboarding" && onboarding[state]) {
    body = <OnboardingView {...onboarding[state]} />;
  } else if (screen === "dashboard" && dashboard[state]) {
    body = <DashboardView {...dashboard[state]} />;
  }
  if (!body) notFound();

  return (
    <>
      <p className="bg-warn-bg text-warn mx-4 mt-1 mb-2 rounded-xl px-4 py-2 text-xs font-medium sm:mx-8">
        Макет: демонстрационные данные, формы отключены.{" "}
        <Link href="/design" className="underline underline-offset-4">
          Все состояния
        </Link>
      </p>
      {body}
    </>
  );
}
