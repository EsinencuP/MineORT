"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { activeIndex } from "@/lib/nav/active";
import type { MenuItem } from "@/lib/menu";
import { Spinner } from "@/components/ui/button-client";
import { ThemeToggle } from "./theme-toggle";

export function MobileNav({ items }: { items: MenuItem[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const here = `${pathname}${search ? `?${search}` : ""}`;

  // The menu is open for as long as the address it was opened on is still current, so it stays
  // on screen (with the tapped item marked as loading) until the new page replaces the old one.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === here;
  const [tapped, setTapped] = useState<string | null>(null);
  const current = activeIndex(items, pathname, params);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedOn(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const onLink = (href: string) => {
    if (href === here)
      setOpenedOn(null); // the page we are already on: just close
    else setTapped(href);
  };
  const tappedProps = (href: string) =>
    open && tapped === href ? ({ "aria-busy": true } as const) : {};
  const pendingMark = (href: string) =>
    open && tapped === href && href !== here ? (
      <Spinner className="ml-2" />
    ) : null;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => {
          setTapped(null);
          setOpenedOn(open ? null : here);
        }}
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
            {items.map((item, i) => (
              <li key={item.href + item.label}>
                {item.children ? (
                  <details open={i === current}>
                    <summary className="font-pixel flex min-h-12 cursor-pointer items-center rounded-2xl px-3 text-xl">
                      {item.label}
                    </summary>
                    <ul className="border-line mb-2 ml-3 border-l pl-3">
                      {item.children.map((child, ci) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={() => onLink(child.href)}
                            aria-current={
                              i === current &&
                              ci ===
                                activeIndex(item.children!, pathname, params)
                                ? "page"
                                : undefined
                            }
                            {...tappedProps(child.href)}
                            className="aria-[current=page]:text-brand-700 flex min-h-11 items-center px-3 aria-[current=page]:font-semibold"
                          >
                            {child.label}
                            {pendingMark(child.href)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => onLink(item.href)}
                    aria-current={i === current ? "page" : undefined}
                    {...tappedProps(item.href)}
                    className="font-pixel aria-[current=page]:bg-brand-50 aria-[current=page]:text-brand-700 flex min-h-12 items-center rounded-2xl px-3 text-xl"
                  >
                    {item.label}
                    {pendingMark(item.href)}
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
                onClick={() => onLink("/start")}
                className="bg-brand-600 text-on-brand flex min-h-12 items-center justify-center rounded-full px-4 font-semibold"
                {...tappedProps("/start")}
              >
                Начать играть
                {pendingMark("/start")}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
