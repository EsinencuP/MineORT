"use client";

import { useState } from "react";
import { TelegramIcon } from "./telegram-icon";

/**
 * "Продолжить через Telegram". A plain link (works without JS); after the click it switches to a
 * loading state while the browser goes to Telegram's official sign-in.
 */
export function TelegramLoginButton({
  href,
  startLoading = false,
}: {
  href: string;
  startLoading?: boolean;
}) {
  const [loading, setLoading] = useState(startLoading);

  return (
    <a
      href={href}
      onClick={() => setLoading(true)}
      aria-busy={loading}
      aria-disabled={loading}
      className={`bg-tg inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-110 ${
        loading ? "pointer-events-none opacity-80" : ""
      }`}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
          Открываем Telegram…
        </>
      ) : (
        <>
          <TelegramIcon className="size-6" />
          Продолжить через Telegram
        </>
      )}
    </a>
  );
}
