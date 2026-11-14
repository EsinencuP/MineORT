import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BLOCKED_COOKIE, safeReturnTo } from "@/lib/auth/session-policy";
import { getSettings } from "@/lib/guides/store";
import { safely } from "@/lib/safe";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Вход" };
export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  cancelled: "Вход отменён. Попробуйте ещё раз.",
  invalid: "Не удалось подтвердить вход. Начните заново.",
  rate_limited: "Слишком много попыток. Подождите минуту.",
  blocked: "Этот аккаунт не может войти.",
  not_configured: "Вход временно недоступен.",
};

/** Reads the short-lived hint set at the blocked sign-in; plain text only. */
async function blockedInfo(): Promise<{
  reason: string | null;
  until: string | null;
} | null> {
  const raw = (await cookies()).get(BLOCKED_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    return {
      reason: typeof v.reason === "string" ? v.reason.slice(0, 300) : null,
      until: typeof v.until === "string" ? v.until : null,
    };
  } catch {
    return null;
  }
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, return_to } = await searchParams;
  const message =
    typeof error === "string" ? (messages[error] ?? messages.invalid) : null;
  const target = safeReturnTo(typeof return_to === "string" ? return_to : null);
  const blocked = error === "blocked" ? await blockedInfo() : null;
  const settings = blocked
    ? await safely("settings", getSettings, { support_contact: "" } as Awaited<
        ReturnType<typeof getSettings>
      >)
    : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold">Вход</h1>
      {message && (
        <div className="mb-4">
          <ErrorState
            title={message}
            description={
              error === "blocked"
                ? [
                    blocked?.reason ? `Причина: ${blocked.reason}.` : null,
                    blocked?.until
                      ? `Действует до ${new Date(blocked.until).toLocaleDateString("ru-RU")}.`
                      : null,
                    settings?.support_contact
                      ? `Связь с администрацией: ${settings.support_contact}.`
                      : "Обратитесь к администрации.",
                  ]
                    .filter(Boolean)
                    .join(" ")
                : undefined
            }
          />
        </div>
      )}
      <ButtonLink
        href={`/api/auth/telegram/start?return_to=${encodeURIComponent(target)}`}
        prefetch={false}
      >
        Войти через Telegram
      </ButtonLink>
    </div>
  );
}
