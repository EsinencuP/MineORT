"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Tone = "ok" | "danger" | "info";
type Toast = { id: number; tone: Tone; text: string };

const ToastContext = createContext<(tone: Tone, text: string) => void>(
  () => {},
);

export const useToast = () => useContext(ToastContext);

const toneClass: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Tone, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
  }, []);
  const dismiss = (id: number) =>
    setToasts((t) => t.filter((x) => x.id !== id));
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex max-w-full items-center gap-3 rounded-lg px-4 py-3 shadow-lg ${toneClass[t.tone]}`}
          >
            <span>{t.text}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Закрыть уведомление"
              className="min-h-11 min-w-11 font-bold"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
