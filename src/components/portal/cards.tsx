import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { Countdown } from "./countdown";
import { CopyButton } from "./copy-button";

/* ---------- server ---------- */
export type ServerCardProps = {
  status: "online" | "offline" | "paused" | "unknown";
  players?: number | null;
  maxPlayers?: number | null;
  version?: string;
  /** Shown only when the whitelist entry is applied (the caller decides). */
  address?: string | null;
};

const SERVER_TEXT: Record<
  ServerCardProps["status"],
  { tone: BadgeTone; text: string }
> = {
  online: { tone: "ok", text: "Сервер онлайн" },
  offline: { tone: "danger", text: "Сервер недоступен" },
  paused: { tone: "warn", text: "Вход временно закрыт" },
  unknown: { tone: "neutral", text: "Статус уточняется" },
};

export function ServerCard({
  status,
  players,
  maxPlayers,
  version,
  address,
}: ServerCardProps) {
  const s = SERVER_TEXT[status];
  const up = status === "online";
  return (
    <Card aria-label="Состояние сервера" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-10 size-44 rounded-full bg-[color:var(--brand-500)] opacity-10 blur-2xl"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Сервер</p>
          <h2 className="mt-1 text-3xl">MineOrt</h2>
        </div>
        <StatusBadge tone={s.tone}>
          {up && (
            <span
              aria-hidden="true"
              className="live-dot mr-1 inline-block size-2 rounded-full bg-current"
            />
          )}
          {s.text}
        </StatusBadge>
      </div>

      <dl className="relative mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Игроки</dt>
          <dd className="font-pixel mt-1 text-xl">
            {up && players != null ? `${players}/${maxPlayers ?? "—"}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Версия</dt>
          <dd className="font-pixel mt-1 text-xl">{version || "уточняется"}</dd>
        </div>
        {address && (
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-ink-muted">Адрес</dt>
            <dd className="mt-1">
              <code className="bg-paper border-line rounded-lg border px-2 py-1 font-mono text-sm">
                {address}
              </code>
            </dd>
          </div>
        )}
      </dl>

      <div className="relative mt-5 flex flex-wrap items-center gap-3">
        {address && up ? (
          <CopyButton text={address} />
        ) : (
          <p className="text-ink-muted text-sm" role="status">
            {!address
              ? "Адрес появится, когда сервер подтвердит ваш допуск."
              : "Сейчас подключиться нельзя: сервер недоступен. Остальные разделы работают."}
          </p>
        )}
        <ButtonLink
          href="/start"
          variant="secondary"
          className="min-h-11 px-5 text-sm"
        >
          Как играть
        </ButtonLink>
      </div>
    </Card>
  );
}

/* ---------- statistics ---------- */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value?: string | null;
  hint: string;
}) {
  return (
    <div className="border-line bg-surface rounded-2xl border p-4">
      <p className="text-ink-muted text-sm">{label}</p>
      {value ? (
        <p className="font-pixel mt-2 text-2xl">{value}</p>
      ) : (
        <p className="text-ink-muted mt-2 text-sm leading-snug">{hint}</p>
      )}
    </div>
  );
}

/* ---------- progress ---------- */
export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div
        className="bg-line h-2.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="bg-brand-500 h-full rounded-full"
          style={{ width: `${v}%` }}
        />
      </div>
      <p className="text-ink-muted mt-1.5 text-xs">
        {label}: {v}%
      </p>
    </div>
  );
}

/* ---------- event ---------- */
export type EventCardProps = {
  title: string;
  startsAt: string; // ISO
  place: string;
  participants: number;
  joined: boolean;
  coverSrc: string;
  timeZone?: string;
  /** Where the button leads (the calendar entry); defaults to the dashboard in design previews. */
  href?: string;
};

export function formatWhen(iso: string, timeZone = "Europe/Chisinau") {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "short",
    timeZone,
  }).format(d);
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(d);
  return `${date}, ${time}`;
}

export function EventCard({
  title,
  startsAt,
  place,
  participants,
  joined,
  coverSrc,
  timeZone,
  href = "/dashboard",
}: EventCardProps) {
  return (
    <Card aria-label="Ближайшее событие" className="overflow-hidden p-0 sm:p-0">
      <div className="grid sm:grid-cols-[minmax(0,2fr)_3fr]">
        <div className="art-bg aspect-[16/10] sm:aspect-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="flex flex-col gap-3 p-5">
          <p className="eyebrow">Ближайшее событие</p>
          <h3 className="font-pixel text-2xl leading-tight">{title}</h3>
          <p className="text-ink-muted text-sm">
            {formatWhen(startsAt, timeZone)}
          </p>
          <p className="text-sm">
            {place} · участвуют: <strong>{participants}</strong>
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-ink-muted text-xs">До начала</p>
              <Countdown target={startsAt} />
            </div>
            {joined ? (
              <StatusBadge tone="ok">Ты участвуешь</StatusBadge>
            ) : (
              <ButtonLink href={href} className="min-h-11 px-5 text-sm">
                Участвовать
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- project ---------- */
export type ProjectCardProps = {
  title: string;
  description: string;
  progress: number;
  progressLabel: string;
  role: string;
  next: string;
  coverSrc: string;
};

export function ProjectCard({
  title,
  description,
  progress,
  progressLabel,
  role,
  next,
  coverSrc,
}: ProjectCardProps) {
  return (
    <div className="border-line bg-surface lift flex gap-4 rounded-2xl border p-4">
      <div className="art-bg size-20 shrink-0 overflow-hidden rounded-xl sm:size-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverSrc}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-pixel text-lg">{title}</h3>
          <span className="bg-brand-50 text-brand-700 rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {role}
          </span>
        </div>
        <p className="text-ink-muted mt-1 text-sm">{description}</p>
        <div className="mt-3">
          <ProgressBar value={progress} label={progressLabel} />
        </div>
        <p className="mt-2 text-sm">
          <span className="text-ink-muted">Дальше: </span>
          {next}
        </p>
      </div>
    </div>
  );
}

/* ---------- vote ---------- */
export type VoteCardProps = {
  question: string;
  endsAt: string;
  voted: boolean;
  /** null when the poll hides its results until the end. */
  participants: number | null;
  href?: string;
};

export function VoteCard({
  question,
  endsAt,
  voted,
  participants,
  href = "/dashboard",
}: VoteCardProps) {
  return (
    <Card
      aria-label="Активное голосование"
      className="flex h-full flex-col gap-3"
    >
      <p className="eyebrow">Голосование</p>
      <h3 className="font-pixel text-xl leading-snug">{question}</h3>
      <p className="text-ink-muted text-sm">
        {participants !== null && <>Проголосовали: {participants} · </>}
        до конца: <Countdown target={endsAt} />
      </p>
      <div className="mt-auto">
        {voted ? (
          <StatusBadge tone="ok">Твой голос учтён</StatusBadge>
        ) : (
          <ButtonLink href={href} className="min-h-11 px-5 text-sm">
            Проголосовать
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

/* ---------- feed ---------- */
export function FeedItem({
  kind,
  title,
  when,
  href,
}: {
  kind: string;
  title: string;
  when: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-brand-50 flex items-start gap-3 rounded-xl p-2.5 transition-colors"
      >
        <span
          aria-hidden="true"
          className="bg-brand-500 mt-1.5 size-2.5 shrink-0 rounded-sm"
        />
        <span className="min-w-0">
          <span className="text-ink-muted block text-xs">
            {kind} · {when}
          </span>
          <span className="block text-sm font-medium">{title}</span>
        </span>
      </Link>
    </li>
  );
}

/* ---------- Telegram notifications ---------- */
export function NotifyCard({ connected }: { connected: boolean }) {
  return (
    <Card
      aria-label="Уведомления в Telegram"
      className="flex h-full flex-col gap-3"
    >
      <p className="eyebrow">Telegram-бот</p>
      <h3 className="font-pixel text-xl leading-snug">
        {connected ? "Уведомления включены" : "Будь в курсе событий MineOrt"}
      </h3>
      <p className="text-ink-muted text-sm">
        {connected
          ? "Бот пришлёт напоминания об ивентах и важных событиях. Настройки можно менять в любой момент."
          : "Подключи нашего Telegram-бота, чтобы получать напоминания об ивентах и важных событиях. Только с твоего согласия."}
      </p>
      <div className="mt-auto">
        <span
          className="bg-tg inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-white opacity-90"
          aria-disabled="true"
        >
          {connected ? "Настройки уведомлений" : "Подключить уведомления"}
        </span>
        <p className="text-ink-muted mt-2 text-xs">
          Подключение бота появится в ближайшем обновлении.
        </p>
      </div>
    </Card>
  );
}

/* ---------- quick actions ---------- */
export function QuickActions({
  items,
}: {
  items: {
    label: string;
    href: string;
    icon: ReactNode;
    disabledHint?: string;
  }[];
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((a) => (
        <li key={a.label}>
          {a.disabledHint ? (
            <span
              className="border-line text-ink-muted flex min-h-16 items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm"
              title={a.disabledHint}
            >
              <span aria-hidden="true">{a.icon}</span>
              <span>
                {a.label}
                <span className="block text-xs">{a.disabledHint}</span>
              </span>
            </span>
          ) : (
            <Link
              href={a.href}
              className="border-line bg-surface hover:bg-brand-50 lift flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold"
            >
              <span aria-hidden="true">{a.icon}</span>
              {a.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
