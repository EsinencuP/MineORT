import Link from "next/link";
import { currentRules } from "@/lib/access/store";
import { safely } from "@/lib/safe";
import { ctaFor } from "@/lib/onboarding/stage";
import { getCurrentStage } from "@/lib/onboarding/server";
import {
  getPublicServerStatus,
  type ServerStatus,
} from "@/lib/site/server-status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";

export const dynamic = "force-dynamic"; // reads the session and live data on every request

const SERVER_LABEL: Record<ServerStatus, { tone: BadgeTone; text: string }> = {
  online: { tone: "ok", text: "Сервер в сети" },
  offline: { tone: "danger", text: "Сервер недоступен" },
  paused: { tone: "warn", text: "Сервер временно закрыт для входа" },
  unknown: { tone: "neutral", text: "Статус сервера уточняется" },
};

export default async function Home() {
  const [stage, status, rules] = await Promise.all([
    safely("stage", getCurrentStage, "guest" as const),
    safely("server status", getPublicServerStatus, "unknown" as const),
    safely("rules", currentRules, null),
  ]);
  const cta = ctaFor(stage);
  const server = SERVER_LABEL[status];
  const excerpt = rules
    ? rules.body.slice(0, 280).trim() + (rules.body.length > 280 ? "…" : "")
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <section aria-labelledby="hero" className="mb-10">
        <h1 id="hero" className="text-3xl font-bold sm:text-4xl">
          MineOrt IV
        </h1>
        <p className="text-ink-muted mt-3 max-w-prose text-lg">
          Сервер Minecraft для своих. Узнайте, как подключиться, и начните
          играть.
        </p>
        <p className="mt-4">
          <StatusBadge tone={server.tone}>{server.text}</StatusBadge>
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href={cta.href} className="min-h-14 px-8 text-lg">
            {cta.label}
          </ButtonLink>
          {cta.secondary && (
            <ButtonLink
              href={cta.secondary.href}
              variant="secondary"
              className="min-h-14 px-6 text-lg"
            >
              {cta.secondary.label}
            </ButtonLink>
          )}
        </div>
      </section>

      <section aria-labelledby="rules" className="mb-10">
        <h2 id="rules" className="mb-3 text-2xl font-bold">
          Правила сервера
        </h2>
        <Card>
          {excerpt ? (
            <>
              <p className="whitespace-pre-wrap">{excerpt}</p>
              <p className="mt-3">
                <Link href="/rules" className="text-brand-700 underline">
                  Читать правила полностью
                </Link>
              </p>
            </>
          ) : (
            <p className="text-ink-muted">Правила скоро будут опубликованы.</p>
          )}
        </Card>
      </section>

      <section id="about" aria-labelledby="about-title">
        <h2 id="about-title" className="mb-3 text-2xl font-bold">
          О проекте
        </h2>
        <p className="text-ink-muted max-w-prose">
          Чтобы играть, войдите через Telegram, примите правила, укажите ник и
          получите допуск по приглашению или заявке. Пошаговая инструкция есть в
          разделе «Как играть».
        </p>
      </section>
    </div>
  );
}
