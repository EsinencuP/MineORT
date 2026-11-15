import type { Metadata } from "next";
import Link from "next/link";
import {
  adminEditGuildAction,
  archiveGuildAction,
  createGuildAction,
  transferOwnerAction,
} from "@/app/actions/guilds";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/guards";
import { requireFlag } from "@/lib/flags";
import { listGuildsAdmin } from "@/lib/guilds/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Гильдии" };

const OK_TEXTS = {
  created: "Гильдия создана.",
  transferred: "Главенство передано.",
  archived: "Гильдия распущена.",
  edited: "Гильдия изменена.",
};

export default async function AdminGuildsPage({
  searchParams,
}: PageProps<"/admin/guilds">) {
  await requireFlag("ff_p1b_guilds");
  await requireStaff(["admin"]);
  const sp = await searchParams;
  const guilds = await listGuildsAdmin();
  const input =
    "bg-paper text-ink border-line min-h-11 rounded-xl border px-3 w-full";

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Гильдии</h1>
      <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />

      <Card className="mb-6">
        <details>
          <summary className="text-brand-700 min-h-11 cursor-pointer py-2 font-semibold">
            ＋ Создать гильдию
          </summary>
          <form
            action={createGuildAction}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="g-name" className="text-sm font-medium">
                Название
              </label>
              <input
                id="g-name"
                name="name"
                required
                minLength={3}
                maxLength={40}
                className={input}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="g-slug" className="text-sm font-medium">
                Адрес (латиница, цифры, дефис)
              </label>
              <input
                id="g-slug"
                name="slug"
                required
                maxLength={40}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                className={input}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="g-tag" className="text-sm font-medium">
                Тег (2–5 символов A–Z, 0–9)
              </label>
              <input
                id="g-tag"
                name="tag"
                required
                minLength={2}
                maxLength={5}
                pattern="[A-Za-z0-9]{2,5}"
                className={input}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="g-color" className="text-sm font-medium">
                Цвет
              </label>
              <input
                id="g-color"
                name="color"
                type="color"
                defaultValue="#2fbf71"
                className="border-line bg-paper min-h-11 w-24 rounded-xl border p-1"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="g-desc" className="text-sm font-medium">
                Описание
              </label>
              <textarea
                id="g-desc"
                name="description"
                rows={3}
                maxLength={1000}
                className="bg-paper text-ink border-line rounded-xl border px-3 py-2"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="g-owner" className="text-sm font-medium">
                Ник главы (подтверждённый игрок без гильдии)
              </label>
              <input
                id="g-owner"
                name="owner"
                required
                maxLength={16}
                className={input}
              />
            </div>
            <div className="sm:col-span-2">
              <PendingButton pendingText="Создаём…">
                Создать гильдию
              </PendingButton>
              <p className="text-ink-muted mt-2 text-xs">
                Потребуется свежее подтверждение кодом из приложения.
              </p>
            </div>
          </form>
        </details>
      </Card>

      {guilds.length === 0 ? (
        <EmptyState title="Гильдий пока нет" />
      ) : (
        <ul className="flex flex-col gap-3">
          {guilds.map((g) => (
            <li key={g.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/guilds/${g.slug}`}
                    className="font-pixel text-lg underline underline-offset-4"
                  >
                    [{g.tag}] {g.name}
                  </Link>
                  {g.status === "archived" ? (
                    <StatusBadge>Распущена</StatusBadge>
                  ) : g.needsOwner ? (
                    <StatusBadge tone="warn">Нужен глава</StatusBadge>
                  ) : (
                    <StatusBadge tone="ok">Активна</StatusBadge>
                  )}
                  <span className="text-ink-muted text-sm">
                    Глава: {g.owner ?? "нет"} · участников: {g.members}
                  </span>
                </div>
                {g.status === "active" && (
                  <div className="flex flex-wrap gap-4">
                    <details>
                      <summary className="text-brand-700 min-h-11 cursor-pointer py-2 text-sm font-semibold">
                        Изменить
                      </summary>
                      <form
                        action={adminEditGuildAction}
                        className="mt-2 flex flex-col gap-2"
                      >
                        <input type="hidden" name="guild_id" value={g.id} />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`en-${g.id}`}
                        >
                          Название
                        </label>
                        <input
                          id={`en-${g.id}`}
                          name="name"
                          required
                          minLength={3}
                          maxLength={40}
                          defaultValue={g.name}
                          className={input}
                        />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`ec-${g.id}`}
                        >
                          Цвет
                        </label>
                        <input
                          id={`ec-${g.id}`}
                          name="color"
                          type="color"
                          defaultValue={g.color}
                          className="border-line bg-paper min-h-11 w-24 rounded-xl border p-1"
                        />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`em-${g.id}`}
                        >
                          Мест в гильдии
                        </label>
                        <input
                          id={`em-${g.id}`}
                          name="max_members"
                          type="number"
                          min={1}
                          max={500}
                          defaultValue={g.maxMembers}
                          className={input}
                        />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`ed-${g.id}`}
                        >
                          Описание
                        </label>
                        <textarea
                          id={`ed-${g.id}`}
                          name="description"
                          rows={3}
                          maxLength={1000}
                          defaultValue={g.description}
                          className="bg-paper text-ink border-line rounded-xl border px-3 py-2"
                        />
                        <PendingButton
                          className="self-start"
                          pendingText="Сохраняем…"
                        >
                          Сохранить
                        </PendingButton>
                      </form>
                    </details>
                    <details>
                      <summary className="text-brand-700 min-h-11 cursor-pointer py-2 text-sm font-semibold">
                        Передать главенство
                      </summary>
                      <form
                        action={transferOwnerAction}
                        className="mt-2 flex flex-col gap-2"
                      >
                        <input type="hidden" name="guild_id" value={g.id} />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`t-${g.id}`}
                        >
                          Ник нового главы (участник гильдии)
                        </label>
                        <input
                          id={`t-${g.id}`}
                          name="new_owner"
                          required
                          maxLength={16}
                          className={input}
                        />
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="keep_vice"
                            className="size-5 accent-[color:var(--brand-600)]"
                          />
                          Оставить прежнего главу заместителем
                        </label>
                        <PendingButton
                          className="self-start"
                          pendingText="Передаём…"
                        >
                          Передать
                        </PendingButton>
                      </form>
                    </details>
                    <details>
                      <summary className="text-danger min-h-11 cursor-pointer py-2 text-sm font-semibold">
                        Распустить гильдию
                      </summary>
                      <form
                        action={archiveGuildAction}
                        className="mt-2 flex flex-col gap-2"
                      >
                        <input type="hidden" name="guild_id" value={g.id} />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`a-${g.id}`}
                        >
                          Введите название «{g.name}» для подтверждения
                        </label>
                        <input
                          id={`a-${g.id}`}
                          name="confirm"
                          required
                          className={input}
                        />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`ar-${g.id}`}
                        >
                          Причина
                        </label>
                        <input
                          id={`ar-${g.id}`}
                          name="reason"
                          required
                          minLength={3}
                          className={input}
                        />
                        <PendingButton
                          variant="danger"
                          className="self-start"
                          pendingText="Распускаем…"
                        >
                          Распустить
                        </PendingButton>
                      </form>
                    </details>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
