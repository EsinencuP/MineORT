"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MenuItem } from "@/lib/menu";

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
        className="border-line min-h-11 rounded-lg border px-3 font-semibold"
      >
        {open ? "Закрыть" : "Меню"}
      </button>
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Главное меню"
          className="bg-paper fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto p-4"
        >
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href + item.label}>
                {item.children ? (
                  <details>
                    <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-lg font-semibold">
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
                    className="flex min-h-11 items-center rounded-lg px-3 text-lg font-semibold"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
            <li className="pt-2">
              <Link
                href="/start"
                onClick={close}
                className="bg-brand-600 text-paper flex min-h-11 items-center justify-center rounded-lg px-4 font-semibold"
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
