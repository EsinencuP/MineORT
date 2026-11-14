import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safely } from "@/lib/safe";
import { getSettings, isBuildOutdated } from "@/lib/guides/store";
import { CAN_CONNECT, ctaFor } from "@/lib/onboarding/stage";
import { getStageForUser } from "@/lib/onboarding/server";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export const dynamic = "force-dynamic"; // reads the session and live data on every request

export const metadata: Metadata = { title: "Установка и подключение" };

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-4" aria-label={title}>
      <h2 className="mb-2 text-lg font-semibold">
        {n}. {title}
      </h2>
      {children}
    </Card>
  );
}

/**
 * Connection wizard. Open to everyone (OD-03), but the server address and "you can connect"
 * appear only when the whitelist entry is applied (applied_state = applied).
 */
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const sp = await searchParams;
  const [user, settings] = await Promise.all([
    safely("session", getCurrentUser, null),
    safely("settings", getSettings, {
      server_address: "",
      minecraft_version: "",
      client_build_version: "",
      client_build_checksum: "",
      client_build_url: "",
    }),
  ]);
  // Without data the safe answer is "guest": the server address stays hidden.
  const stage = user
    ? await safely(
        "stage",
        async () => (await getStageForUser(user.userId)).stage,
        "guest" as const,
      )
    : "guest";
  const canConnect = CAN_CONNECT.has(stage);
  const cta = ctaFor(stage);
  const mine = typeof sp.my_build === "string" ? sp.my_build.slice(0, 40) : "";
  const outdated = isBuildOutdated(settings.client_build_version, mine);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Установка и подключение</h1>
      <p className="text-ink-muted mb-6">
        Версия Minecraft:{" "}
        <strong>{settings.minecraft_version || "уточняется"}</strong> · сборка:{" "}
        <strong>{settings.client_build_version || "уточняется"}</strong>
      </p>

      {!canConnect && (
        <Card className="mb-6" role="status">
          <p className="mb-3">
            {stage === "access_preparing"
              ? "Доступ подготавливается: сервер ещё не подтвердил ваш допуск. Адрес сервера появится здесь, когда всё будет готово."
              : "Адрес сервера появится после того, как вы получите допуск и сервер его применит."}
          </p>
          <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
        </Card>
      )}

      <Step n={1} title="Установите сборку">
        {settings.client_build_url ? (
          <p>
            <a
              className="text-brand-700 underline"
              href={settings.client_build_url}
              rel="noopener noreferrer"
            >
              Скачать MineOrt Client {settings.client_build_version}
            </a>
            {settings.client_build_checksum && (
              <span className="text-ink-muted mt-1 block font-mono text-xs break-all">
                SHA-256: {settings.client_build_checksum}
              </span>
            )}
          </p>
        ) : (
          <p className="text-ink-muted">Сборка клиента ещё не опубликована.</p>
        )}
        <p className="mt-2">
          Подробная инструкция:{" "}
          <Link className="text-brand-700 underline" href="/guide">
            Как играть
          </Link>
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-2" method="get">
          <label className="flex flex-col gap-1 text-sm">
            Моя версия сборки
            <input
              name="my_build"
              defaultValue={mine}
              className="border-line bg-paper text-ink min-h-11 rounded-lg border px-3"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            className="border-line min-h-11 rounded-lg border px-4 font-medium"
          >
            Проверить
          </button>
        </form>
        {mine && (
          <p className="mt-2" role="status">
            {outdated ? (
              <StatusBadge tone="warn">
                Ваша сборка {mine} устарела. Актуальная:{" "}
                {settings.client_build_version}. Обновите её.
              </StatusBadge>
            ) : (
              <StatusBadge tone="ok">Версия сборки актуальна</StatusBadge>
            )}
          </p>
        )}
      </Step>

      <Step n={2} title="Подключитесь к серверу">
        {canConnect ? (
          <>
            <p className="mb-2">
              <StatusBadge tone="ok">Можно подключаться</StatusBadge>
            </p>
            {settings.server_address ? (
              <p>
                Адрес сервера:{" "}
                <code className="bg-surface rounded px-2 py-1 font-mono">
                  {settings.server_address}
                </code>
              </p>
            ) : (
              <p className="text-ink-muted">Адрес сервера скоро появится.</p>
            )}
          </>
        ) : (
          <p className="text-ink-muted">
            Этот шаг откроется, когда сервер подтвердит ваш допуск.
          </p>
        )}
      </Step>

      <Step n={3} title="Подтвердите первый вход">
        <p className="text-ink-muted">
          При первом входе в игре вы получите код. Введите его в личном
          кабинете, чтобы подтвердить, что ник ваш.
        </p>
        {canConnect && (
          <p className="mt-2">
            <Link className="text-brand-700 underline" href="/dashboard">
              Открыть личный кабинет
            </Link>
          </p>
        )}
      </Step>
    </div>
  );
}
