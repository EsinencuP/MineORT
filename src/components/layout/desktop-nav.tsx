"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { activeIndex } from "@/lib/nav/active";
import type { MenuItem } from "@/lib/menu";

/** Top menu on wide screens. The current section is marked here, on the client, because the header lives in the layout and is not re-rendered when only the page changes. */
export function DesktopNav({ items }: { items: MenuItem[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = activeIndex(items, pathname, params);

  return (
    <nav aria-label="Главное меню" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {items.map((item, i) => {
          const childIdx = item.children
            ? activeIndex(item.children, pathname, params)
            : -1;
          return (
            <li key={item.href + item.label} className="group relative">
              <Link
                href={item.href}
                aria-current={i === current ? "page" : undefined}
                className={`hover:bg-brand-50 flex min-h-11 items-center rounded-full px-3 text-sm whitespace-nowrap ${
                  i === current
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : ""
                }`}
              >
                {item.label}
              </Link>
              {item.children && (
                <ul className="border-line bg-paper invisible absolute top-full left-0 z-30 min-w-56 rounded-2xl border p-1.5 shadow-[var(--shadow-card)] group-focus-within:visible group-hover:visible">
                  {item.children.map((child, ci) => (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        aria-current={ci === childIdx ? "page" : undefined}
                        className={`hover:bg-brand-50 flex min-h-11 items-center rounded-xl px-3 text-sm ${
                          ci === childIdx ? "text-brand-700 font-semibold" : ""
                        }`}
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
