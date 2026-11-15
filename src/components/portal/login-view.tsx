import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { TelegramLoginButton } from "./telegram-login";

export type LoginError =
  "cancelled" | "invalid" | "rate_limited" | "blocked" | "not_configured";

const ERRORS: Record<LoginError, { title: string; text: string }> = {
  cancelled: {
    title: "Вход отменён",
    text: "Ты закрыл окно Telegram до подтверждения. Ничего страшного: попробуй ещё раз.",
  },
  invalid: {
    title: "Не удалось подтвердить вход",
    text: "Что-то пошло не так при проверке. Начни вход заново.",
  },
  rate_limited: {
    title: "Слишком много попыток",
    text: "Подожди минуту и попробуй снова.",
  },
  blocked: {
    title: "Этот аккаунт не может войти",
    text: "Доступ ограничен администрацией.",
  },
  not_configured: {
    title: "Вход временно недоступен",
    text: "Мы уже разбираемся. Попробуй чуть позже.",
  },
};

const BENEFITS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-6"
        fill="currentColor"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <path d="M8 3h8v2h2v6h-2v2h-1v2h5v6H4v-6h5v-2H8v-2H6V5h2z" />
      </svg>
    ),
    title: "Один аккаунт",
    text: "Для сайта и всего игрового сообщества.",
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-6"
        fill="currentColor"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <path d="M11 2h2v2h3v2h1v6h2v3h2v2H3v-2h2v-3h2V6h1V4h3zM10 19h4v2h-4z" />
      </svg>
    ),
    title: "Уведомления",
    text: "О событиях и проектах, если подключишь бота.",
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-6"
        fill="currentColor"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <path d="M12 2l8 3v6c0 5-3 9-8 11C7 20 4 16 4 11V5zm-1 6v5l4 2 1-2-2-1V8z" />
      </svg>
    ),
    title: "Управление доступом",
    text: "Допуск на сервер и whitelist в одном месте.",
  },
];

/**
 * Screen 1 content. Presentational so the same markup serves /login and the design preview states.
 * `startLoading` shows the "opening Telegram" state; `error` shows the failed or cancelled state.
 */
export function LoginView({
  href,
  error,
  detail,
  startLoading = false,
}: {
  href: string;
  error?: LoginError | null;
  detail?: string | null;
  startLoading?: boolean;
}) {
  const err = error ? ERRORS[error] : null;
  return (
    <div className="relative grid gap-8 px-4 pt-2 pb-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_1.05fr] lg:items-center lg:gap-10 lg:pb-16">
      <div className="relative z-10">
        <p className="eyebrow">Добро пожаловать в MineOrt</p>
        <h1 className="mt-4 text-[clamp(2.3rem,6vw,3.6rem)] leading-[1.02]">
          Твоё приключение начинается здесь
        </h1>
        <p className="text-ink-muted mt-4 max-w-md text-base leading-relaxed">
          Присоединяйся к MineOrt — миру, который мы создаём вместе.
        </p>

        <Card className="mt-7 max-w-md">
          <h2 className="text-2xl">Войти в MineOrt</h2>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">
            Используй Telegram, чтобы получить доступ к игровому порталу.
            Никаких дополнительных паролей.
          </p>

          {err && (
            <div
              role="alert"
              className="bg-danger-bg text-danger mt-4 rounded-2xl p-4 text-sm"
            >
              <p className="font-semibold">{err.title}</p>
              <p className="mt-1">
                {[err.text, detail].filter(Boolean).join(" ")}
              </p>
            </div>
          )}

          <div className="mt-5">
            <TelegramLoginButton href={href} startLoading={startLoading} />
          </div>
          <p className="text-ink-muted mt-3 text-center text-sm">
            Твой Minecraft-аккаунт привяжем на следующем шаге.
          </p>
          <p className="text-ink-muted mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
            <Link
              href="/rules"
              className="hover:text-ink underline underline-offset-4"
            >
              Правила сервера
            </Link>
            <Link
              href="/privacy"
              className="hover:text-ink underline underline-offset-4"
            >
              Политика конфиденциальности
            </Link>
          </p>
        </Card>

        <ul className="mt-6 grid max-w-md gap-3 sm:grid-cols-3 lg:max-w-lg">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex gap-3 sm:flex-col sm:gap-2">
              <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-xl">
                {b.icon}
              </span>
              <span>
                <span className="block text-sm font-semibold">{b.title}</span>
                <span className="text-ink-muted block text-xs leading-snug">
                  {b.text}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="art-bg relative order-first overflow-hidden rounded-[1.75rem] lg:order-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/art/hero.webp"
          width={1200}
          height={952}
          decoding="async"
          alt="Воксельный остров с замком, рекой и путником на утёсе"
          className="mx-auto w-full max-w-[34rem] lg:max-w-none lg:scale-110"
        />
      </div>
    </div>
  );
}
