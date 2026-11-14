import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Вход" };

const messages: Record<string, string> = {
  cancelled: "Вход отменён. Попробуйте ещё раз.",
  invalid: "Не удалось подтвердить вход. Начните заново.",
  rate_limited: "Слишком много попыток. Подождите минуту.",
  blocked: "Этот аккаунт не может войти. Обратитесь к администратору.",
  not_configured: "Вход временно недоступен.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message =
    typeof error === "string" ? (messages[error] ?? messages.invalid) : null;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold">Вход</h1>
      {message && (
        <div className="mb-4">
          <ErrorState title={message} />
        </div>
      )}
      <ButtonLink href="/api/auth/telegram/start" prefetch={false}>
        Войти через Telegram
      </ButtonLink>
    </div>
  );
}
