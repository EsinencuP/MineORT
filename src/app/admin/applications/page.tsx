import type { Metadata } from "next";
import { decideApplicationAction } from "@/app/actions/admin";
import { listPendingApplications } from "@/lib/access/store";
import { requireStaff } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Заявки" };

type Row = {
  id: string;
  text: string | null;
  created_at: string;
  minecraft_identities: { nickname: string } | { nickname: string }[] | null;
};

const nickOf = (r: Row) =>
  Array.isArray(r.minecraft_identities)
    ? r.minecraft_identities[0]?.nickname
    : r.minecraft_identities?.nickname;

export default async function ApplicationsPage({
  searchParams,
}: PageProps<"/admin/applications">) {
  await requireStaff();
  const sp = await searchParams;
  const rows = (await listPendingApplications()) as unknown as Row[];

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Заявки на допуск</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{ "1": "Решение сохранено." }}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Очередь пуста"
          description="Новые заявки появятся здесь."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <p className="font-semibold">
                  Ник: {nickOf(r) ?? "—"}{" "}
                  <span className="text-ink-muted text-sm font-normal">
                    · {new Date(r.created_at).toLocaleString("ru-RU")}
                  </span>
                </p>
                {r.text && <p className="mt-2 whitespace-pre-wrap">{r.text}</p>}
                <form
                  action={decideApplicationAction}
                  className="mt-4 flex flex-col gap-3"
                >
                  <input type="hidden" name="application_id" value={r.id} />
                  <label
                    htmlFor={`reason-${r.id}`}
                    className="text-sm font-medium"
                  >
                    Причина (обязательна при отклонении)
                  </label>
                  <input
                    id={`reason-${r.id}`}
                    name="reason"
                    className="border-line bg-paper text-ink min-h-11 rounded-lg border px-3"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" name="decision" value="approve">
                      Одобрить
                    </Button>
                    <Button
                      type="submit"
                      name="decision"
                      value="reject"
                      variant="danger"
                    >
                      Отклонить
                    </Button>
                  </div>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
