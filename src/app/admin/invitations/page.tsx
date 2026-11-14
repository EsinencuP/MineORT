import type { Metadata } from "next";
import { revokeInvitationAction } from "@/app/actions/admin";
import { listInvitations } from "@/lib/access/store";
import { requireStaff } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { CreateInvitationForm } from "./create-form";

export const metadata: Metadata = { title: "Приглашения" };

function stateOf(i: {
  status: string;
  used_count: number;
  max_uses: number;
  expires_at: string;
}): {
  tone: BadgeTone;
  label: string;
} {
  if (i.status === "revoked") return { tone: "danger", label: "Отозвано" };
  if (Date.parse(i.expires_at) <= Date.now())
    return { tone: "neutral", label: "Истекло" };
  if (i.used_count >= i.max_uses)
    return { tone: "neutral", label: "Использовано" };
  return { tone: "ok", label: "Активно" };
}

export default async function InvitationsPage({
  searchParams,
}: PageProps<"/admin/invitations">) {
  await requireStaff(["admin"]);
  const sp = await searchParams;
  const rows = await listInvitations();
  const origin = process.env.APP_URL ?? "";

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Приглашения</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{ "1": "Приглашение отозвано." }}
      />
      <Card className="mb-6">
        <CreateInvitationForm origin={origin} />
        <p className="text-ink-muted mt-3 text-sm">
          Одноразовое, действует 7 дней.
        </p>
      </Card>
      <ul className="flex flex-col gap-2">
        {rows.map((i) => {
          const s = stateOf(i);
          return (
            <li
              key={i.id}
              className="border-line flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
              <span className="text-sm">
                создано {new Date(i.created_at).toLocaleString("ru-RU")} · до{" "}
                {new Date(i.expires_at).toLocaleString("ru-RU")} · использований{" "}
                {i.used_count}/{i.max_uses}
              </span>
              {s.label === "Активно" && (
                <form action={revokeInvitationAction} className="ml-auto">
                  <input type="hidden" name="invitation_id" value={i.id} />
                  <Button type="submit" variant="secondary">
                    Отозвать
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
