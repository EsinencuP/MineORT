"use client";

import { useState } from "react";

/** What the project needs: a title, an optional amount and a unit ("железо · 192 · шт."), up to 15 rows. */
export function NeedsInput({ max = 15 }: { max?: number }) {
  const [rows, setRows] = useState<number[]>([1]);
  const [next, setNext] = useState(2);
  const field =
    "bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm";
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Что нужно</legend>
      {rows.map((id, i) => (
        <div key={id} className="flex flex-wrap items-center gap-2">
          <input
            name="need_title"
            maxLength={80}
            placeholder={i === 0 ? "Например: железо" : "Что ещё нужно"}
            aria-label={`Потребность ${i + 1}`}
            className={`${field} min-w-40 flex-[3]`}
          />
          <input
            name="need_qty"
            type="number"
            min={1}
            max={100000}
            placeholder="Сколько"
            aria-label={`Количество ${i + 1}`}
            className={`${field} w-24`}
          />
          <input
            name="need_unit"
            maxLength={20}
            placeholder="Ед."
            aria-label={`Единица ${i + 1}`}
            className={`${field} w-20`}
          />
          {rows.length > 1 && (
            <button
              type="button"
              aria-label={`Убрать потребность ${i + 1}`}
              onClick={() => setRows((r) => r.filter((x) => x !== id))}
              className="hover:bg-danger-bg text-danger inline-flex size-11 items-center justify-center rounded-full"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <p className="text-ink-muted text-xs">
        Количество можно не указывать: тогда это пункт «сделано / не сделано»,
        например «нужен дизайнер».
      </p>
      {rows.length < max && (
        <button
          type="button"
          onClick={() => {
            setRows((r) => [...r, next]);
            setNext((n) => n + 1);
          }}
          className="text-brand-700 min-h-11 self-start text-sm font-semibold underline underline-offset-4"
        >
          ＋ Добавить потребность
        </button>
      )}
    </fieldset>
  );
}
