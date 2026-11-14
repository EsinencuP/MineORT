"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

/** Inline script run before first paint so the chosen theme never flashes. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("mo-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const read = (): Theme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";
const subscribe = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => mo.disconnect();
};

export function ThemeToggle() {
  // The <html data-theme> attribute is the single source of truth.
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => "dark");

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("mo-theme", next);
    } catch {
      /* storage blocked: the choice just lasts for this page */
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={
        theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
      }
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="border-line bg-paper text-ink hover:bg-brand-50 inline-flex size-11 items-center justify-center rounded-full border transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="currentColor"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        {theme === "dark" ? (
          <path d="M11 2h2v3h-2zM11 19h2v3h-2zM2 11h3v2H2zM19 11h3v2h-3zM5 5h2v2H5zM17 17h2v2h-2zM17 5h2v2h-2zM5 17h2v2H5zM9 8h6v1h1v6h-1v1H9v-1H8V9h1z" />
        ) : (
          <path d="M9 3h5v2h-2v2h-1v3h1v2h2v1h3v2h2v2h-3v2h-3v1H9v-1H7v-2H6v-2H5V9h1V7h1V5h2z" />
        )}
      </svg>
    </button>
  );
}
