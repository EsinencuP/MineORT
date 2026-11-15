import Link from "next/link";
import { currentRules } from "@/lib/access/store";
import { ctaFor } from "@/lib/onboarding/stage";
import { getCurrentStage } from "@/lib/onboarding/server";
import { safely } from "@/lib/safe";
import {
  getPublicServerStatus,
  type ServerStatus,
} from "@/lib/site/server-status";
import { FeaturedRow } from "@/components/home/featured-row";
import { isEnabled } from "@/lib/flags";
import { listPublicGallery } from "@/lib/social/gallery";
import { ButtonLink, circleClass } from "@/components/ui/button";
import { ArrowRight, PlayIcon } from "@/components/ui/icons";
import {
  LEAF,
  LEAF_COLORS,
  PICKAXE,
  PICKAXE_COLORS,
  PixelSprite,
} from "@/components/ui/pixel-sprite";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";

export const dynamic = "force-dynamic"; // reads the session and live data on every request

const SERVER_LABEL: Record<ServerStatus, { tone: BadgeTone; text: string }> = {
  online: { tone: "ok", text: "Сервер в сети" },
  offline: { tone: "danger", text: "Сервер недоступен" },
  paused: { tone: "warn", text: "Сервер временно закрыт для входа" },
  unknown: { tone: "neutral", text: "Статус сервера уточняется" },
};

const SKY = "art-bg";

const WORLDS = [
  { src: "/art/meadow.webp", alt: "Луга с ветряной мельницей" },
  { src: "/art/snow.webp", alt: "Снежные горы и ели" },
  { src: "/art/cherry.webp", alt: "Вишнёвая роща на острове" },
  { src: "/art/lava.webp", alt: "Лавовая пещера" },
];

function Eyebrow({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="eyebrow">
      {children}
    </p>
  );
}

export default async function Home() {
  const [stage, status, rules] = await Promise.all([
    safely("stage", getCurrentStage, "guest" as const),
    safely("server status", getPublicServerStatus, "unknown" as const),
    safely("rules", currentRules, null),
  ]);
  const shots = isEnabled("ff_p1a")
    ? await safely("home gallery", () => listPublicGallery({}, 8), null)
    : null;
  const cta = ctaFor(stage);
  const server = SERVER_LABEL[status];
  const excerpt = rules
    ? rules.body.slice(0, 280).trim() + (rules.body.length > 280 ? "…" : "")
    : null;

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section aria-labelledby="hero" className="relative overflow-x-clip">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-0"
          style={{
            background:
              "linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--sky) 45%, transparent) 62%, color-mix(in srgb, var(--sky) 80%, transparent) 100%)",
          }}
        />
        <div className="relative grid gap-2 px-4 pt-4 pb-16 sm:px-8 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:pb-24">
          <div className="relative z-10">
            <Eyebrow>Сообщество Minecraft</Eyebrow>
            <h1
              id="hero"
              className="font-display mt-5 text-[clamp(2.1rem,7.4vw,4.6rem)] leading-[1.02]"
            >
              <span className="block">Строй</span>
              <span className="block">Твори</span>
              <span className="text-accent relative block">
                Исследуй
                <PixelSprite
                  rows={LEAF}
                  colors={LEAF_COLORS}
                  size={5}
                  className="absolute -top-1 -right-9 hidden sm:block"
                />
              </span>
            </h1>
            <p className="text-ink-muted mt-6 max-w-sm text-base leading-relaxed sm:text-lg">
              Сервер MineOrt V: общий мир, где идеи превращаются в постройки.
              Войдите через Telegram, примите правила и получите допуск.
            </p>
            <p className="mt-4">
              <StatusBadge tone={server.tone}>{server.text}</StatusBadge>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <ButtonLink href={cta.href} className="min-h-14 px-8 text-base">
                {cta.label}
                <ArrowRight className="size-5" />
              </ButtonLink>
              {cta.secondary && (
                <Link
                  href={cta.secondary.href}
                  className="inline-flex items-center gap-3 text-sm font-medium"
                >
                  <span className={circleClass}>
                    <PlayIcon className="size-5" />
                  </span>
                  {cta.secondary.label}
                </Link>
              )}
            </div>
          </div>

          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/art/hero.webp"
              width={1200}
              height={952}
              fetchPriority="high"
              decoding="async"
              alt="Воксельный остров с замком, рекой и путником, который сидит с собакой на утёсе"
              className="relative mx-auto w-full max-w-[34rem] lg:-mt-6 lg:-mr-12 lg:w-[122%] lg:max-w-none"
            />
          </div>
        </div>
        {/* wave: the sky area ends in a soft curve */}
        <svg
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-12 w-full sm:h-16"
        >
          <path
            d="M0 52 C 180 8, 420 78, 720 36 S 1180 6, 1440 40 L1440 80 L0 80 Z"
            fill="var(--paper)"
          />
        </svg>
      </section>

      {/* ---------- About ---------- */}
      <section
        aria-labelledby="about"
        id="about"
        className="relative px-4 py-10 sm:px-8 lg:py-16"
      >
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_.9fr]">
          <div className="relative pr-6 pb-28 lg:pr-0">
            <div
              className={`${SKY} ring-paper relative aspect-video overflow-hidden rounded-[1.75rem] shadow-[var(--shadow-card)] ring-4`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/community/gathering.webp"
                alt="Игроки MineOrt собрались вместе в подземелье"
                width={960}
                height={540}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </div>
            <figure
              className={`${SKY} ring-paper absolute right-0 bottom-0 h-36 w-52 overflow-hidden rounded-3xl shadow-[var(--shadow-card)] ring-4 sm:h-40 sm:w-60 lg:right-[-1.5rem]`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/art/house.webp"
                alt="Воксельный дом на холме"
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </figure>
            <PixelSprite
              rows={LEAF}
              colors={LEAF_COLORS}
              size={6}
              className="absolute -top-4 right-2 hidden rotate-12 opacity-80 lg:block"
            />
          </div>

          <div className="border-line relative lg:border-l lg:pl-12">
            <Eyebrow>О проекте</Eyebrow>
            <h2
              id="about-title"
              className="font-pixel mt-4 text-4xl leading-tight sm:text-5xl"
            >
              Мир, который строим вместе
            </h2>
            <p className="text-ink-muted mt-5 max-w-md text-base leading-relaxed">
              Строим, исследуем и придумываем новое вместе. Вход через Telegram,
              ясные правила и допуск по приглашению или заявке.
            </p>
            <Link
              href="/guide"
              className="border-ink mt-6 inline-flex items-center gap-2 border-b-2 pb-0.5 text-sm font-semibold"
            >
              Как играть
              <ArrowRight className="size-4" />
            </Link>
            <PixelSprite
              rows={PICKAXE}
              colors={PICKAXE_COLORS}
              size={7}
              className="pointer-events-none absolute -right-2 bottom-[-3.5rem] hidden opacity-90 xl:block"
            />
          </div>
        </div>
      </section>

      {/* ---------- Worlds ---------- */}
      <section aria-labelledby="worlds-title" className="px-4 py-6 sm:px-8">
        <div className="mb-6 flex items-center gap-5">
          <span className="bg-line h-px flex-1" aria-hidden="true" />
          <h2 id="worlds-title" className="eyebrow">
            Миры сервера
          </h2>
          <span className="bg-line h-px flex-1" aria-hidden="true" />
        </div>
        <FeaturedRow items={WORLDS} />
      </section>

      {/* ---------- Community screenshots ---------- */}
      {shots && shots.items.length > 0 && (
        <section aria-labelledby="shots-title" className="px-4 pt-10 sm:px-8">
          <div className="mb-6 flex items-center gap-5">
            <span className="bg-line h-px flex-1" aria-hidden="true" />
            <h2 id="shots-title" className="eyebrow">
              Из галереи сообщества
            </h2>
            <span className="bg-line h-px flex-1" aria-hidden="true" />
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {shots.items.slice(0, 8).map((g) => (
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
          <p className="mt-4 text-center">
            <Link
              href="/social/gallery"
              className="text-brand-700 font-semibold underline underline-offset-4"
            >
              Открыть галерею
            </Link>
          </p>
        </section>
      )}

      {/* ---------- Quote ---------- */}
      <section
        aria-label="Девиз"
        className="relative mt-12 overflow-hidden px-4 sm:px-8"
      >
        <div className="grid items-center lg:grid-cols-[.85fr_1.15fr]">
          <figure className="relative z-10 py-6 lg:py-16">
            <span
              aria-hidden="true"
              className="font-pixel text-accent block text-6xl leading-none"
            >
              “
            </span>
            <blockquote className="font-pixel -mt-2 max-w-md text-3xl leading-tight sm:text-4xl">
              Маленькие идеи — в большие миры.
            </blockquote>
            <span aria-hidden="true" className="bg-ink mt-5 block h-px w-16" />
          </figure>
          <div className="relative -mx-4 sm:-mx-8 lg:mx-0 lg:-mr-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/art/landscape.webp"
              width={1100}
              height={671}
              loading="lazy"
              decoding="async"
              alt="Панорама: горы со снежными вершинами и лес"
              className="w-full"
              style={{
                WebkitMaskImage:
                  "linear-gradient(to right, transparent, #000 30%), linear-gradient(to bottom, #000 62%, transparent)",
                maskImage:
                  "linear-gradient(to right, transparent, #000 30%), linear-gradient(to bottom, #000 62%, transparent)",
                WebkitMaskComposite: "source-in",
                maskComposite: "intersect",
              }}
            />
          </div>
        </div>
      </section>

      {/* ---------- Rules ---------- */}
      <section aria-labelledby="rules" className="px-4 pt-12 sm:px-8">
        <div className="bg-surface border-line rounded-[1.75rem] border p-6 sm:p-8">
          <Eyebrow>Для новичков</Eyebrow>
          <h2 id="rules" className="font-pixel mt-3 text-3xl sm:text-4xl">
            Правила сервера
          </h2>
          {excerpt ? (
            <>
              <p className="text-ink-muted mt-4 max-w-2xl whitespace-pre-wrap">
                {excerpt}
              </p>
              <Link
                href="/rules"
                className="border-ink mt-5 inline-flex items-center gap-2 border-b-2 pb-0.5 text-sm font-semibold"
              >
                Читать правила полностью
                <ArrowRight className="size-4" />
              </Link>
            </>
          ) : (
            <p className="text-ink-muted mt-4">
              Правила скоро будут опубликованы.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
