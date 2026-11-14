import type { BadgeTone } from "@/components/ui/status-badge";

export const STATUS_LABEL: Record<string, { tone: BadgeTone; text: string }> = {
  active: { tone: "ok", text: "Активен" },
  suspended: { tone: "warn", text: "Приостановлен" },
  banned: { tone: "danger", text: "Забанен" },
  deleted: { tone: "neutral", text: "Удалён" },
};
