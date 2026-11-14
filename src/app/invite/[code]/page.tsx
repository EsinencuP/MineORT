import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { TelegramLoginButton } from "@/components/portal/telegram-login";

export const metadata: Metadata = { title: "Приглашение" };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: PageProps<"/invite/[code]">) {
  const { code } = await params;
  const user = await getCurrentUser();
  // Signed in: continue in the wizard with the code already filled in.
  if (user) redirect(`/onboarding/minecraft?code=${encodeURIComponent(code)}`);

  const next = `/onboarding/minecraft?code=${encodeURIComponent(code)}`;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:px-8">
      <p className="eyebrow">Приглашение</p>
      <h1 className="mt-3 text-3xl">Тебя пригласили в MineOrt</h1>
      <p className="text-ink-muted mt-3">
        Войди через Telegram, и мы подставим код приглашения на следующем шаге.
      </p>
      <Card className="mt-6 flex flex-col gap-4">
        <TelegramLoginButton
          href={`/api/auth/telegram/start?return_to=${encodeURIComponent(next)}`}
        />
        <ButtonLink
          href="/rules"
          variant="ghost"
          className="self-center text-sm"
        >
          Прочитать правила сервера
        </ButtonLink>
      </Card>
    </div>
  );
}
