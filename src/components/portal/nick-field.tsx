"use client";

import { useId, useState } from "react";
import { MinecraftAvatar } from "./minecraft-avatar";

const FORMAT = /^[A-Za-z0-9_]{3,16}$/;

/**
 * Nickname input with a live avatar preview and instant format feedback.
 * The server validates again and also reports taken or quarantined names.
 */
export function NickField({
  defaultValue = "",
  serverError,
}: {
  defaultValue?: string;
  serverError?: string | null;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();
  const formatError =
    trimmed.length > 0 && !FORMAT.test(trimmed)
      ? "3–16 символов: латиница, цифры и «_»."
      : null;
  const error = formatError ?? serverError ?? null;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-semibold">
        Как тебя зовут в Minecraft?
      </label>
      <div className="flex items-center gap-3">
        <MinecraftAvatar
          nick={FORMAT.test(trimmed) ? trimmed : null}
          size={56}
        />
        <input
          id={id}
          name="nick"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Твой Minecraft-ник"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={16}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          className={`bg-paper text-ink min-h-14 min-w-0 flex-1 rounded-2xl border px-4 text-lg ${error ? "border-danger" : "border-line"}`}
        />
      </div>
      <p
        id={`${id}-hint`}
        className={`mt-2 text-sm ${error ? "text-danger" : "text-ink-muted"}`}
        aria-live="polite"
      >
        {error ??
          "Введи точное имя, с которым будешь подключаться к серверу. Лицензия не нужна."}
      </p>
    </div>
  );
}
