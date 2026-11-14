import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BLOCKED_COOKIE, safeReturnTo } from "@/lib/auth/session-policy";
import { getSettings } from "@/lib/guides/store";
import { safely } from "@/lib/safe";
import { LoginView, type LoginError } from "@/components/portal/login-view";

export const metadata: Metadata = { title: "Вход" };
export const dynamic = "force-dynamic";

const KNOWN: LoginError[] = [
  "cancelled",
  "invalid",
  "rate_limited",
  "blocked",
  "not_configured",
];

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
  const code =
    typeof error === "string"
      ? KNOWN.includes(error as LoginError)
        ? (error as LoginError)
        : "invalid"
      : null;
  const target = safeReturnTo(typeof return_to === "string" ? return_to : null);

  let detail: string | null = null;
  if (code === "blocked") {
    const blocked = await blockedInfo();
    const settings = await safely("settings", getSettings, null);
    detail = [
      blocked?.reason ? `Причина: ${blocked.reason}.` : null,
      blocked?.until
        ? `Действует до ${new Date(blocked.until).toLocaleDateString("ru-RU")}.`
        : null,
      settings?.support_contact
        ? `Связь с администрацией: ${settings.support_contact}.`
        : "Обратитесь к администрации.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <LoginView
      href={`/api/auth/telegram/start?return_to=${encodeURIComponent(target)}`}
      error={code}
      detail={detail}
    />
  );
}
