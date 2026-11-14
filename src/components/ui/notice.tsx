import { messageFor } from "@/lib/access/messages";
import { StatusBadge } from "./status-badge";

/** Reads ?error=code / ?ok=1 from page search params and shows one banner. */
export function Notice({
  error,
  ok,
  okTexts = {},
}: {
  error?: string | string[];
  ok?: string | string[];
  /** Text per ?ok=<key> value; unknown keys show a generic message. */
  okTexts?: Record<string, string>;
}) {
  const code = typeof error === "string" ? error : null;
  if (code) {
    return (
      <p role="alert" className="mb-4">
        <StatusBadge tone="danger">{messageFor(code)}</StatusBadge>
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="mb-4">
        <StatusBadge tone="ok">
          {(typeof ok === "string" && okTexts[ok]) || "Готово."}
        </StatusBadge>
      </p>
    );
  }
  return null;
}
