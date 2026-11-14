import type { Metadata } from "next";
import Link from "next/link";
import { searchPlayers } from "@/lib/admin/players";
import { requireStaff } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { STATUS_LABEL } from "@/lib/admin/labels";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Игроки" };

export default async function PlayersPage({
  searchParams,
}: PageProps<"/admin/players">) {
  await requireStaff(["admin"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const rows = await searchPlayers(q);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Игроки</h1>
      <form role="search" method="get" className="mb-6 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Поиск игрока
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          maxLength={60}
          placeholder="Ник, Telegram или имя"
          className="border-line bg-paper text-ink min-h-11 min-w-0 flex-1 rounded-lg border px-3"
        />
        <Button type="submit">Найти</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="Никого не найдено" />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => {
            const s = STATUS_LABEL[p.account_status] ?? STATUS_LABEL.active;
            return (
              <li
                key={p.id}
                className="border-line flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <StatusBadge tone={s.tone}>{s.text}</StatusBadge>
                <Link
                  href={`/admin/players/${p.id}`}
                  className="text-brand-700 font-medium underline"
                >
                  {p.nickname ?? p.display_name ?? p.id.slice(0, 8)}
                </Link>
                <span className="text-ink-muted text-sm">
                  {p.telegram_username
                    ? `@${p.telegram_username}`
                    : "без Telegram"}{" "}
                  · {p.site_role}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
