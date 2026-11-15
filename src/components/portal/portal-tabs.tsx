"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { activeIndex } from "@/lib/nav/active";

export type PortalTab = {
  label: string;
  href: string;
  /** Other path prefixes that belong to the same section. */
  also?: string[];
  /** Pages of the section; shown in a second row while the section is open. */
  children?: PortalTab[];
};

const pill = (on: boolean) =>
  `flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
    on ? "bg-brand-600 text-on-brand" : "hover:bg-brand-50"
  }`;

/**
 * Section tabs of the portal: a short row of sections and, under it, the pages of the section you
 * are in. The current ones are worked out from the address here, on the client, so the same bar can
 * sit in the shared layout of every section and keep up with navigation (audit N-03). Few tabs wrap
 * onto a second line instead of hiding behind a scroll.
 */
export function PortalTabs({ items }: { items: PortalTab[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const cur = activeIndex(items, pathname, params);
  const group = cur >= 0 ? items[cur] : null;
  const sub = group?.children ?? [];
  const subCur = activeIndex(sub, pathname, params);

  return (
    <div className="min-w-0 flex-1">
      <ul className="flex flex-wrap gap-1">
        {items.map((i, n) => (
          <li key={i.label}>
            <Link
              href={i.href}
              aria-current={n === cur && !sub.length ? "page" : undefined}
              className={pill(n === cur)}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
      {sub.length > 0 && (
        <ul
          aria-label={group!.label}
          className="border-line mt-1 flex flex-wrap gap-1 border-t pt-1"
        >
          {sub.map((c, n) => (
            <li key={c.label}>
              <Link
                href={c.href}
                aria-current={n === subCur ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-full px-3.5 text-sm whitespace-nowrap transition-colors ${
                  n === subCur
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "text-ink-muted hover:bg-brand-50"
                }`}
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
