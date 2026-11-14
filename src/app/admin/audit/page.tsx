import type { Metadata } from "next";
import { listAudit } from "@/lib/access/store";
import { requireStaff } from "@/lib/auth/guards";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Аудит" };

type Row = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  at: string;
  actor_id: string | null;
  users:
    { display_name: string | null } | { display_name: string | null }[] | null;
};

const actorName = (r: Row) => {
  const u = Array.isArray(r.users) ? r.users[0] : r.users;
  return u?.display_name ?? r.actor_id?.slice(0, 8) ?? "система";
};

export default async function AuditPage() {
  await requireStaff(["admin"]);
  const rows = (await listAudit(100)) as unknown as Row[];
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Журнал аудита</h1>
      {rows.length === 0 ? (
        <EmptyState title="Записей пока нет" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-line border-b">
                <th className="p-2">Время</th>
                <th className="p-2">Кто</th>
                <th className="p-2">Действие</th>
                <th className="p-2">Детали</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-line border-b align-top">
                  <td className="p-2 whitespace-nowrap">
                    {new Date(r.at).toLocaleString("ru-RU")}
                  </td>
                  <td className="p-2">{actorName(r)}</td>
                  <td className="p-2 font-mono">{r.action}</td>
                  <td className="p-2 font-mono break-all">
                    {JSON.stringify(r.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
