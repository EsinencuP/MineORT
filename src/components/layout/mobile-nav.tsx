"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MenuItem } from "@/lib/menu";
import { ThemeToggle } from "./theme-toggle";

export function MobileNav({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="border-brand-500/60 bg-paper relative z-50 min-h-11 rounded-full border px-4 text-sm font-semibold"
      >
        {open ? "Закрыть" : "Меню"}
      </button>
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Главное меню"
          className="bg-paper fixed inset-0 z-40 overflow-y-auto p-4 pt-20"
        >
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href + item.label}>
                {item.children ? (
                  <details>
                    <summary className="font-pixel flex min-h-12 cursor-pointer items-center rounded-2xl px-3 text-xl">
                      {item.label}
                    </summary>
                    <ul className="border-line mb-2 ml-3 border-l pl-3">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={close}
                            className="flex min-h-11 items-center px-3"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Link
                    href={item.href}
                    onClick={close}
                    className="font-pixel flex min-h-12 items-center rounded-2xl px-3 text-xl"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
            <li className="flex items-center gap-3 pt-3 min-[380px]:hidden">
              <ThemeToggle />
              <span className="text-ink-muted text-sm">Тема оформления</span>
            </li>
            <li className="pt-3">
              <Link
                href="/start"
                onClick={close}
                className="bg-brand-600 text-on-brand flex min-h-12 items-center justify-center rounded-full px-4 font-semibold"
              >
                Начать играть
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
