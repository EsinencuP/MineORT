import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addNeedAction,
  cancelProjectAction,
  joinSupportAction,
  leaveSupportAction,
  removeNeedAction,
  removeSupporterAction,
  setProjectStatusAction,
  updateNeedAction,
  updateProjectAction,
} from "@/app/actions/projects";
import { CopyButton } from "@/components/portal/copy-button";
import { ProgressBar } from "@/components/portal/cards";
import { coverOf } from "@/components/projects/project-card";
import { ProjectFields } from "@/components/projects/project-fields";
import { PendingButton } from "@/components/social/pending-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { requireFlag } from "@/lib/flags";
import {
  DIMENSIONS,
  getProject,
  STATUS_LABEL,
  type Need,
  type ProjectStatus,
} from "@/lib/projects/store";
import { safely } from "@/lib/safe";
import { listMyGallery } from "@/lib/social/gallery";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TONE: Record<ProjectStatus, BadgeTone> = {
  recruiting: "warn",
  in_progress: "info",
  done: "ok",
  cancelled: "neutral",
};
const OK_TEXTS = {
  created: "Проект создан. Теперь к нему можно записываться.",
  saved: "Проект сохранён.",
  status: "Статус изменён.",
  need_added: "Потребность добавлена.",
  need_saved: "Прогресс сохранён.",
  need_removed: "Потребность удалена.",
  joined: "Вы записаны в поддержку. Автор видит вашу запись.",
  left: "Вы вышли из поддержки проекта.",
  supporter_removed: "Помощник убран из списка.",
  cancelled: "Проект закрыт.",
};

export async function generateMetadata({
  params,
}: PageProps<"/social/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Проект" };
  const p = await getProject(await getViewer(), id).catch(() => null);
  return { title: p?.title ?? "Проект" };
}

const amount = (n: Need) =>
  n.quantityNeeded
    ? `${n.quantityDone} из ${n.quantityNeeded}${n.unit ? ` ${n.unit}` : ""}`
    : n.done
      ? "Сделано"
      : "Нужно";

export default async function ProjectPage({
  params,
  searchParams,
}: PageProps<"/social/projects/[id]">) {
  await requireFlag("ff_p1a");
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const viewer = await getViewer();
  const p = await getProject(viewer, id);
  if (!p) notFound();
  const here = `/social/projects/${id}`;
  const open = p.status === "recruiting" || p.status === "in_progress";
  const field =
    "bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm";
  const gallery = p.canManage
    ? await safely("covers", () => listMyGallery(viewer.userId!), [])
    : [];
  const covers = gallery
    .filter((g) => g.visibility === "public" && !g.hidden)
    .map((g) => ({ id: g.id, caption: g.caption }));
  const coords =
    p.x !== null && p.z !== null
      ? `${p.x} ${p.y ?? ""} ${p.z}`.replace(/\s+/g, " ").trim()
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <p>
        <Link
          href="/social/projects"
          className="text-brand-700 text-sm font-semibold underline underline-offset-4"
        >
          ← Все проекты
        </Link>
      </p>

      <div className="mt-4 flex flex-col gap-5">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />

        <div className="border-line art-bg overflow-hidden rounded-2xl border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverOf(p)}
            alt=""
            className="max-h-72 w-full object-cover"
          />
        </div>

        <header>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={TONE[p.status]}>
              {STATUS_LABEL[p.status]}
            </StatusBadge>
            <span className="text-ink-muted text-sm">
              Автор: {p.authorName}
            </span>
          </div>
          <h1 className="mt-2 text-[clamp(1.8rem,5vw,2.6rem)] leading-tight break-words">
            {p.title}
          </h1>
          {p.status === "cancelled" && (
            <p className="text-danger mt-2 text-sm">
              Проект закрыт{p.cancelReason ? `: ${p.cancelReason}` : ""}.
            </p>
          )}
        </header>

        <Card className="flex flex-col gap-3">
          <h2 className="sr-only">О проекте</h2>
          {p.description ? (
            <p className="leading-relaxed break-words whitespace-pre-line">
              {p.description}
            </p>
          ) : (
            <p className="text-ink-muted">Описание пока не добавлено.</p>
          )}
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Место</dt>
              <dd className="font-semibold break-words">
                {p.place || "Не указано"} · {DIMENSIONS[p.dimension]}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Координаты</dt>
              <dd className="flex flex-wrap items-center gap-2 font-mono">
                {coords ?? "Не указаны"}
                {coords && (
                  <CopyButton
                    text={coords}
                    label="Скопировать"
                    className="min-h-9 px-3 text-xs"
                  />
                )}
              </dd>
            </div>
          </dl>
          <ProgressBar value={p.progress} label="Готовность проекта" />
        </Card>

        <section aria-labelledby="needs" className="flex flex-col gap-3">
          <h2 id="needs" className="text-2xl">
            Что нужно
          </h2>
          {p.needs.length === 0 ? (
            <p className="text-ink-muted text-sm">
              Автор ещё не указал, что нужно.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {p.needs.map((n) => {
                const pct = n.quantityNeeded
                  ? Math.min(
                      100,
                      Math.round((n.quantityDone / n.quantityNeeded) * 100),
                    )
                  : n.done
                    ? 100
                    : 0;
                return (
                  <li key={n.id}>
                    <Card
                      className="flex flex-col gap-2 p-3 sm:p-4"
                      data-need-id={n.id}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 font-semibold break-words">
                          {n.title}
                        </span>
                        <span className="text-sm">{amount(n)}</span>
                        {n.done && <StatusBadge tone="ok">Закрыто</StatusBadge>}
                      </div>
                      <ProgressBar value={pct} label={`Закрыто: ${n.title}`} />
                      {n.pledged > 0 && (
                        <p className="text-ink-muted text-xs">
                          Обещано помощниками: {n.pledged}
                          {n.unit ? ` ${n.unit}` : ""}
                        </p>
                      )}
                      {p.canManage && (
                        <div className="flex flex-wrap items-end gap-2">
                          {n.quantityNeeded ? (
                            <form
                              action={updateNeedAction}
                              className="flex items-end gap-2"
                            >
                              <input
                                type="hidden"
                                name="project_id"
                                value={p.id}
                              />
                              <input
                                type="hidden"
                                name="need_id"
                                value={n.id}
                              />
                              <input
                                type="hidden"
                                name="return_to"
                                value={here}
                              />
                              <div className="flex flex-col gap-1">
                                <label
                                  className="text-xs font-medium"
                                  htmlFor={`qd-${n.id}`}
                                >
                                  Сделано
                                </label>
                                <input
                                  id={`qd-${n.id}`}
                                  name="quantity_done"
                                  type="number"
                                  min={0}
                                  max={100000}
                                  defaultValue={n.quantityDone}
                                  className={`${field} w-28`}
                                />
                              </div>
                              <PendingButton
                                variant="secondary"
                                className="min-h-11 px-4 text-sm"
                                pendingText="…"
                              >
                                Сохранить
                              </PendingButton>
                            </form>
                          ) : (
                            <form action={updateNeedAction}>
                              <input
                                type="hidden"
                                name="project_id"
                                value={p.id}
                              />
                              <input
                                type="hidden"
                                name="need_id"
                                value={n.id}
                              />
                              <input
                                type="hidden"
                                name="return_to"
                                value={here}
                              />
                              <PendingButton
                                variant="secondary"
                                name="mark"
                                value={n.done ? "undone" : "done"}
                                className="min-h-11 px-4 text-sm"
                                pendingText="…"
                              >
                                {n.done
                                  ? "Вернуть в работу"
                                  : "Отметить сделанным"}
                              </PendingButton>
                            </form>
                          )}
                          <form action={removeNeedAction}>
                            <input
                              type="hidden"
                              name="project_id"
                              value={p.id}
                            />
                            <input type="hidden" name="need_id" value={n.id} />
                            <input
                              type="hidden"
                              name="return_to"
                              value={here}
                            />
                            <PendingButton
                              variant="ghost"
                              className="text-danger min-h-11 px-4 text-sm"
                              pendingText="…"
                            >
                              Удалить
                            </PendingButton>
                          </form>
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
          {p.canManage && p.needs.length < 15 && (
            <Card>
              <form
                action={addNeedAction}
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="project_id" value={p.id} />
                <input type="hidden" name="return_to" value={here} />
                <div className="flex min-w-40 flex-[3] flex-col gap-1">
                  <label htmlFor="nn-title" className="text-xs font-medium">
                    Новая потребность
                  </label>
                  <input
                    id="nn-title"
                    name="title"
                    required
                    maxLength={80}
                    className={field}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="nn-qty" className="text-xs font-medium">
                    Сколько
                  </label>
                  <input
                    id="nn-qty"
                    name="quantity"
                    type="number"
                    min={1}
                    max={100000}
                    className={`${field} w-24`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="nn-unit" className="text-xs font-medium">
                    Ед.
                  </label>
                  <input
                    id="nn-unit"
                    name="unit"
                    maxLength={20}
                    className={`${field} w-20`}
                  />
                </div>
                <PendingButton
                  className="min-h-11 px-4 text-sm"
                  pendingText="Добавляем…"
                >
                  Добавить
                </PendingButton>
              </form>
            </Card>
          )}
        </section>

        <section aria-labelledby="support" className="flex flex-col gap-3">
          <h2 id="support" className="text-2xl">
            Поддержка
          </h2>
          {viewer.cls === "guest" ? (
            <div className="border-line bg-surface flex flex-col items-start gap-3 rounded-2xl border p-4 text-sm">
              <p>Войдите, чтобы записаться в поддержку проекта.</p>
              <ButtonLink href="/login" className="min-h-11 px-5 text-sm">
                Войти через Telegram
              </ButtonLink>
            </div>
          ) : p.isAuthor ? (
            <p className="text-ink-muted text-sm">
              Вы автор проекта. Помощники ниже видят то, что вы указали выше.
            </p>
          ) : !viewer.canPublish ? (
            <p className="border-line bg-surface rounded-2xl border p-4 text-sm">
              Записаться могут участники сервера.{" "}
              <Link
                href="/onboarding/minecraft"
                className="text-brand-700 font-semibold underline underline-offset-4"
              >
                Получить допуск
              </Link>
            </p>
          ) : !open ? (
            <p className="text-ink-muted text-sm">
              Проект завершён: запись в поддержку закрыта.
            </p>
          ) : (
            <Card>
              {p.mySupport && (
                <p className="mb-3">
                  <StatusBadge tone="ok">Вы в поддержке</StatusBadge>
                </p>
              )}
              <form action={joinSupportAction} className="flex flex-col gap-3">
                <input type="hidden" name="project_id" value={p.id} />
                <input type="hidden" name="return_to" value={here} />
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="sup-need" className="text-sm font-medium">
                      Чем помогу
                    </label>
                    <select
                      id="sup-need"
                      name="need_id"
                      defaultValue={p.mySupport?.needId ?? ""}
                      className={field}
                    >
                      <option value="">Готов помочь везде</option>
                      {p.needs
                        .filter((n) => !n.done)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="sup-qty" className="text-sm font-medium">
                      Сколько принесу
                    </label>
                    <input
                      id="sup-qty"
                      name="quantity"
                      type="number"
                      min={1}
                      max={100000}
                      defaultValue={p.mySupport?.quantity ?? undefined}
                      className={field}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sup-note" className="text-sm font-medium">
                    Заметка автору (необязательно)
                  </label>
                  <input
                    id="sup-note"
                    name="note"
                    maxLength={200}
                    defaultValue={p.mySupport?.note}
                    className={field}
                  />
                </div>
                <PendingButton className="self-start" pendingText="Записываем…">
                  {p.mySupport ? "Обновить запись" : "Записаться в поддержку"}
                </PendingButton>
              </form>
              {p.mySupport && (
                <form action={leaveSupportAction} className="mt-2">
                  <input type="hidden" name="project_id" value={p.id} />
                  <input type="hidden" name="return_to" value={here} />
                  <PendingButton
                    variant="ghost"
                    className="min-h-11 px-4 text-sm"
                    pendingText="…"
                  >
                    Выйти из поддержки
                  </PendingButton>
                </form>
              )}
            </Card>
          )}

          <div>
            <h3 className="text-xl">
              Помощники · {p.supporters}
              {p.maxSupporters ? ` из ${p.maxSupporters}` : ""}
            </h3>
            {p.supporterList === null ? (
              <p className="text-ink-muted mt-2 text-sm">
                Список помощников виден вошедшим игрокам.
              </p>
            ) : p.supporterList.length === 0 ? (
              <p className="text-ink-muted mt-2 text-sm">
                Пока никто не записался. Станьте первым.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {p.supporterList.map((s) => (
                  <li
                    key={s.nick}
                    className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/players/${s.nick}`}
                        className="font-semibold underline underline-offset-4"
                      >
                        {s.nick}
                      </Link>
                      {s.mine && (
                        <span className="text-brand-700 ml-2 text-xs font-semibold">
                          это вы
                        </span>
                      )}
                      <p className="text-ink-muted text-xs break-words">
                        {[
                          s.needTitle
                            ? `${s.needTitle}${s.quantity ? ` · ${s.quantity}` : ""}`
                            : "Готов помочь везде",
                          s.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {p.canManage && (
                      <form action={removeSupporterAction}>
                        <input type="hidden" name="project_id" value={p.id} />
                        <input type="hidden" name="nick" value={s.nick} />
                        <input type="hidden" name="return_to" value={here} />
                        <PendingButton
                          variant="ghost"
                          className="text-danger min-h-11 px-3 text-sm"
                          pendingText="…"
                        >
                          Убрать
                        </PendingButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {p.canManage && (
          <section aria-labelledby="manage" className="flex flex-col gap-3">
            <h2 id="manage" className="text-2xl">
              Управление
            </h2>
            <Card className="flex flex-col gap-3">
              <p className="text-sm font-medium">Статус проекта</p>
              <form
                action={setProjectStatusAction}
                className="flex flex-wrap gap-2"
              >
                <input type="hidden" name="project_id" value={p.id} />
                <input type="hidden" name="return_to" value={here} />
                {(["recruiting", "in_progress", "done"] as const).map((s) => (
                  <PendingButton
                    key={s}
                    name="status"
                    value={s}
                    variant={p.status === s ? "primary" : "secondary"}
                    className="min-h-11 px-4 text-sm"
                    pendingText="…"
                    disabled={p.status === s}
                  >
                    {STATUS_LABEL[s]}
                  </PendingButton>
                ))}
              </form>
            </Card>
            <Card>
              <details>
                <summary className="text-brand-700 min-h-11 cursor-pointer py-2 font-semibold">
                  Изменить описание, место и обложку
                </summary>
                <form
                  action={updateProjectAction}
                  className="mt-3 flex flex-col gap-4"
                >
                  <input type="hidden" name="project_id" value={p.id} />
                  <input type="hidden" name="return_to" value={here} />
                  <ProjectFields value={p} covers={covers} idPrefix="e" />
                  <PendingButton
                    className="self-start"
                    pendingText="Сохраняем…"
                  >
                    Сохранить проект
                  </PendingButton>
                </form>
              </details>
            </Card>
            <Card>
              <details>
                <summary className="text-danger min-h-11 cursor-pointer py-2 font-semibold">
                  Закрыть проект
                </summary>
                <form
                  action={cancelProjectAction}
                  className="mt-3 flex flex-col gap-3"
                >
                  <input type="hidden" name="project_id" value={p.id} />
                  <input
                    type="hidden"
                    name="return_to"
                    value="/social/projects"
                  />
                  <label
                    htmlFor="cancel-reason"
                    className="text-sm font-medium"
                  >
                    Причина (необязательно)
                  </label>
                  <input
                    id="cancel-reason"
                    name="reason"
                    maxLength={300}
                    className={field}
                  />
                  <p className="text-ink-muted text-xs">
                    Проект исчезнет из списка, помощники перестанут его видеть.
                  </p>
                  <PendingButton
                    variant="danger"
                    className="self-start"
                    pendingText="Закрываем…"
                  >
                    Закрыть проект
                  </PendingButton>
                </form>
              </details>
            </Card>
          </section>
        )}

        {!p.isAuthor && viewer.canModerate && p.status !== "cancelled" && (
          <Card className="flex flex-col gap-3">
            <h2 className="text-xl">Модерация</h2>
            <form
              action={cancelProjectAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="project_id" value={p.id} />
              <input type="hidden" name="return_to" value="/social/projects" />
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <label htmlFor="mod-reason" className="text-sm font-medium">
                  Причина закрытия
                </label>
                <input id="mod-reason" name="reason" className={field} />
              </div>
              <PendingButton
                variant="danger"
                className="min-h-11 px-4 text-sm"
                pendingText="…"
              >
                Закрыть проект
              </PendingButton>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
