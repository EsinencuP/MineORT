import type { Metadata } from "next";
import { deleteOwnAccountAction } from "@/app/actions/account";
import { isFreshLogin } from "@/lib/auth/session-policy";
import { requireUser } from "@/lib/auth/guards";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Удаление аккаунта" };
export const dynamic = "force-dynamic";

export default async function DeleteAccountPage({
  searchParams,
}: PageProps<"/dashboard/delete">) {
  const user = await requireUser("/dashboard/delete");
  const sp = await searchParams;
  const fresh = isFreshLogin(user.createdAt);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Удаление аккаунта</h1>
      <Notice error={sp.error} />
      <Card className="flex flex-col gap-4">
        <p>
          Будут завершены все сессии, ваш доступ на сервере снят, Telegram
          отвязан. Ник освобождается; если вы уже играли, он будет закрыт для
          других на время карантина. Действие необратимо.
        </p>
        {fresh ? (
          <form action={deleteOwnAccountAction} className="flex flex-col gap-4">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="confirm" className="size-5" />Я
              понимаю, что аккаунт будет удалён
            </label>
            <Button type="submit" variant="danger" className="self-start">
              Удалить аккаунт
            </Button>
          </form>
        ) : (
          <>
            <p role="status">
              Для удаления нужен свежий вход через Telegram (не старше 5 минут).
            </p>
            <ButtonLink
              href="/api/auth/telegram/start?return_to=/dashboard/delete"
              prefetch={false}
            >
              Войти заново и продолжить
            </ButtonLink>
          </>
        )}
        <ButtonLink
          href="/dashboard"
          variant="secondary"
          className="self-start"
        >
          Отмена
        </ButtonLink>
      </Card>
    </div>
  );
}
