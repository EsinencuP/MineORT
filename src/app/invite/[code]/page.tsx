import type { Metadata } from "next";
import { redeemInvitationAction } from "@/app/actions/access";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Приглашение" };

export default async function InvitePage({
  params,
  searchParams,
}: PageProps<"/invite/[code]">) {
  const [{ code }, sp, user] = await Promise.all([
    params,
    searchParams,
    getCurrentUser(),
  ]);
  const here = `/invite/${encodeURIComponent(code)}`;
  const done = sp.ok === "invite";

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold">Приглашение на сервер</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{
          invite: "Приглашение принято. Допуск получен.",
          rules: "Правила приняты. Теперь используйте приглашение.",
        }}
      />
      {done ? (
        <ButtonLink href="/start">Продолжить</ButtonLink>
      ) : user ? (
        <form action={redeemInvitationAction} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={code} />
          <input type="hidden" name="return_to" value={here} />
          <p className="text-ink-muted">
            Перед использованием нужно принять правила сервера.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Использовать приглашение</Button>
            <ButtonLink
              href={`/rules?return_to=${encodeURIComponent(here)}`}
              variant="secondary"
            >
              Прочитать правила
            </ButtonLink>
          </div>
        </form>
      ) : (
        <>
          <p className="text-ink-muted mb-4">
            Войдите через Telegram, и вы вернётесь на эту страницу, чтобы
            принять приглашение.
          </p>
          <ButtonLink
            href={`/api/auth/telegram/start?return_to=${encodeURIComponent(here)}`}
            prefetch={false}
          >
            Войти через Telegram
          </ButtonLink>
        </>
      )}
    </div>
  );
}
