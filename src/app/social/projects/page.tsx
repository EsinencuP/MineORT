import type { Metadata } from "next";
import Link from "next/link";
import { ProjectListCard } from "@/components/projects/project-card";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { requireFlag } from "@/lib/flags";
import { listProjects, STATUS_LABEL } from "@/lib/projects/store";
import { safely } from "@/lib/safe";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Проекты" };

const OK_TEXTS = { cancelled: "Проект закрыт." };
const FILTERS = [
  ["", "Все"],
  ["recruiting", STATUS_LABEL.recruiting],
  ["in_progress", STATUS_LABEL.in_progress],
  ["done", STATUS_LABEL.done],
] as const;

export default async function ProjectsPage({
  searchParams,
}: PageProps<"/social/projects">) {
  await requireFlag("ff_p1a");
  const sp = await searchParams;
  const viewer = await getViewer();
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const mine = sp.mine === "1" && !!viewer.userId;
  const page = Math.max(0, Number.parseInt(String(sp.p ?? "0"), 10) || 0);
  const result = await safely(
    "projects",
    () => listProjects(viewer, { status, q, mine, page }),
    null,
  );
  const href = (over: Record<string, string | number>) => {
    const u = new URLSearchParams();
    const all: Record<string, string | number> = {
      status,
      q,
      mine: mine ? "1" : "",
      p: page,
      ...over,
    };
    for (const [k, v] of Object.entries(all))
      if (v !== "" && v !== 0) u.set(k, String(v));
    const s = u.toString();
    return `/social/projects${s ? `?${s}` : ""}`;
  };
  const chip = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
      on ? "bg-brand-600 text-on-brand" : "border-line hover:bg-brand-50 border"
    }`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="eyebrow">Сообщество</p>
      <h1 className="mt-2 text-[clamp(1.9rem,5vw,2.8rem)] leading-tight">
        Проекты
      </h1>
      <p className="text-ink-muted mt-2 max-w-2xl">
        Общие стройки сервера: что нужно, где это и кто уже помогает. Запишись в
        поддержку, а автор увидит, чем ты готов помочь.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map(([id, label]) => (
          <Link
            key={id}
            href={href({ status: id, p: 0 })}
            aria-current={status === id && !mine ? "page" : undefined}
            className={chip(status === id && !mine)}
          >
            {label}
          </Link>
        ))}
        {viewer.userId && (
          <Link
            href={href({ mine: "1", status: "", p: 0 })}
            aria-current={mine ? "page" : undefined}
            className={chip(mine)}
          >
            Мои
          </Link>
        )}
        {viewer.canPublish && (
          <ButtonLink
            href="/social/projects/new"
            className="ml-auto min-h-11 px-5 text-sm"
          >
            Создать проект
          </ButtonLink>
        )}
      </div>

      <form
        role="search"
        action="/social/projects"
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor="pq" className="text-sm font-medium">
            Поиск по названию
          </label>
          <input
            id="pq"
            name="q"
            defaultValue={q}
            maxLength={60}
            className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
          />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        {mine && <input type="hidden" name="mine" value="1" />}
        <button
          type="submit"
          className="bg-brand-600 text-on-brand min-h-11 rounded-full px-6 font-semibold"
        >
          Найти
        </button>
      </form>

      <div className="mt-5 flex flex-col gap-4">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />
        {result === null ? (
          <ErrorState
            title="Не удалось загрузить проекты"
            description="Обновите страницу через минуту."
          />
        ) : result.projects.length === 0 ? (
          <EmptyState
            title={
              mine
                ? "У вас пока нет проектов"
                : q || status
                  ? "По выбранным условиям проектов нет"
                  : "Проектов пока нет"
            }
            description={
              viewer.canPublish
                ? "Создайте первый: опишите, что нужно, и где это."
                : "Как только появятся проекты, они будут здесь."
            }
          />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
            {result.projects.map((p) => (
              <li key={p.id}>
                <ProjectListCard p={p} back={href({})} />
              </li>
            ))}
          </ul>
        )}
        {result && (page > 0 || result.hasMore) && (
          <div className="flex items-center justify-between">
            {page > 0 ? (
              <Link
                href={href({ p: page - 1 })}
                className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
              >
                ← Назад
              </Link>
            ) : (
              <span />
            )}
            {result.hasMore && (
              <Link
                href={href({ p: page + 1 })}
                className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
              >
                Дальше →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
