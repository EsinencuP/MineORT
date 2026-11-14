import type { BadgeTone } from "@/components/ui/status-badge";

export type Line = { tone: BadgeTone; text: string };

export function applicationLine(status: string | undefined): Line {
  switch (status) {
    case "pending":
      return { tone: "warn", text: "Заявка на рассмотрении" };
    case "approved":
      return { tone: "ok", text: "Заявка одобрена" };
    case "rejected":
      return { tone: "danger", text: "Заявка отклонена" };
    case "withdrawn":
      return { tone: "neutral", text: "Заявка отозвана" };
    default:
      return { tone: "neutral", text: "Заявки нет" };
  }
}

export function membershipLine(status: string | undefined): Line {
  switch (status) {
    case "approved":
      return { tone: "ok", text: "Допуск получен" };
    case "pending":
      return { tone: "warn", text: "Допуск ожидает решения" };
    case "suspended":
      return { tone: "danger", text: "Допуск приостановлен" };
    default:
      return { tone: "neutral", text: "Допуска пока нет" };
  }
}

/** Honest text: "applied" is the only state that means the game server really has the entry. */
export function whitelistLine(
  wl: { desired: string; applied_state: string } | null,
): Line {
  if (!wl || wl.desired === "off")
    return { tone: "neutral", text: "Доступ на сервере не оформлен" };
  switch (wl.applied_state) {
    case "applied":
      return { tone: "ok", text: "Доступ готов: сервер подтвердил" };
    case "failed":
      return {
        tone: "danger",
        text: "Не удалось применить на сервере: задержка, администратор уведомлён",
      };
    case "drift":
      return { tone: "warn", text: "Задержка: сервер сверяет доступ" };
    default:
      return { tone: "warn", text: "Применяется на сервере" };
  }
}

export function identityLine(confirmed: boolean): Line {
  return confirmed
    ? { tone: "ok", text: "Подтверждена" }
    : {
        tone: "neutral",
        text: "Не подтверждена: подтвердите при первом входе в игру",
      };
}
