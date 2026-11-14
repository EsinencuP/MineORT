"use client";

import { useState } from "react";

/** 2 to 10 answer options; every row is a separate `option` field. */
export function PollOptionsInput() {
  const [rows, setRows] = useState<number[]>([1, 2]);
  const [next, setNext] = useState(3);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Варианты ответа</legend>
      {rows.map((id, i) => (
        <div key={id} className="flex items-center gap-2">
          <input
            name="option"
            required
            maxLength={100}
            placeholder={`Вариант ${i + 1}`}
            aria-label={`Вариант ${i + 1}`}
            className="bg-paper text-ink border-line min-h-11 flex-1 rounded-xl border px-3"
          />
          {rows.length > 2 && (
            <button
              type="button"
              aria-label={`Убрать вариант ${i + 1}`}
              onClick={() => setRows((r) => r.filter((x) => x !== id))}
              className="hover:bg-danger-bg text-danger inline-flex size-11 items-center justify-center rounded-full"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {rows.length < 10 && (
        <button
          type="button"
          onClick={() => {
            setRows((r) => [...r, next]);
            setNext((n) => n + 1);
          }}
          className="text-brand-700 min-h-11 self-start text-sm font-semibold underline underline-offset-4"
        >
          ＋ Добавить вариант
        </button>
      )}
    </fieldset>
  );
}
