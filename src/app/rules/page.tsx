import type { Metadata } from "next";
import { acceptRulesAction } from "@/app/actions/access";
import { currentRules, hasAcceptedCurrentRules } from "@/lib/access/store";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safely } from "@/lib/safe";
import { safeReturnTo } from "@/lib/auth/session-policy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";

export const dynamic = "force-dynamic"; // reads the session and live data on every request

export const metadata: Metadata = { title: "Правила сервера" };

export default async function RulesPage({ searchParams }: PageProps<"/rules">) {
  const sp = await searchParams;
  const [rules, user] = await Promise.all([
    safely("rules", currentRules, null),
    safely("session", getCurrentUser, null),
  ]);
  const accepted =
    user && rules ? await hasAcceptedCurrentRules(user.userId) : false;
  const returnTo = safeReturnTo(
    typeof sp.return_to === "string" ? sp.return_to : "/rules",
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Правила сервера</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{ rules: "Правила приняты." }}
      />
      {!rules ? (
        <EmptyState
          title="Правила пока не опубликованы"
          description="Они появятся здесь, когда администратор опубликует первую версию."
        />
      ) : (
        <>
          <p className="text-ink-muted mb-4 text-sm">
            Версия {rules.version_major}.{rules.version_minor} · опубликована{" "}
            {new Date(rules.published_at).toLocaleDateString("ru-RU")}
          </p>
          <Card className="mb-6">
            <div className="whitespace-pre-wrap">{rules.body}</div>
          </Card>
          {user ? (
            accepted ? (
              <StatusBadge tone="ok">Вы приняли эту версию правил</StatusBadge>
            ) : (
              <form action={acceptRulesAction}>
                <input type="hidden" name="version_id" value={rules.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <Button type="submit">Принимаю правила</Button>
              </form>
            )
          ) : (
            <p className="text-ink-muted">
              Войдите через Telegram, чтобы принять правила.
            </p>
          )}
        </>
      )}
    </div>
  );
}
