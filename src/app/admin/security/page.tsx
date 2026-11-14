import type { Metadata } from "next";
import { confirmTotpAction } from "@/app/actions/staff";
import { getTotpState, startTotpEnrollment } from "@/lib/admin/store";
import { otpauthUri } from "@/lib/admin/totp";
import { requireStaff } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Безопасность" };

export default async function SecurityPage({
  searchParams,
}: PageProps<"/admin/security">) {
  const user = await requireStaff(undefined, { allowWithoutTotp: true });
  const sp = await searchParams;
  const state = await getTotpState(user.userId);
  const secret = state.confirmed
    ? null
    : await startTotpEnrollment(user.userId);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Безопасность администратора</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{ "1": "Двухфакторная защита включена." }}
      />
      {state.confirmed ? (
        <Card>
          <p>
            <StatusBadge tone="ok">Двухфакторная защита включена</StatusBadge>
          </p>
          <p className="text-ink-muted mt-3">
            Критичные действия (бан, разбан, удаление аккаунта) просят код из
            приложения-аутентификатора. После ввода кода подтверждение действует
            15 минут.
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <p>
            <StatusBadge tone="warn">
              Нужно настроить двухфакторную защиту
            </StatusBadge>
          </p>
          <p>
            Пока она не включена, админ-панель закрыта. Добавьте аккаунт в
            приложение-аутентификатор (Google Authenticator, Aegis, 2FAS и др.)
            и введите первый код.
          </p>
          <div>
            <p className="text-sm font-medium">Секретный ключ</p>
            <code className="bg-paper block rounded-lg px-3 py-2 font-mono break-all">
              {secret}
            </code>
            <p className="text-ink-muted mt-2 text-sm break-all">
              Или ссылка для импорта:{" "}
              <span className="font-mono">
                {otpauthUri(secret!, user.userId.slice(0, 8))}
              </span>
            </p>
          </div>
          <form action={confirmTotpAction} className="flex flex-col gap-3">
            <Field
              name="code"
              label="Код из приложения"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            <Button type="submit" className="self-start">
              Включить защиту
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
