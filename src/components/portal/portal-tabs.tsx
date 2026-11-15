"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { activeIndex } from "@/lib/nav/active";

export type PortalTab = {
  label: string;
  href: string | null;
  also?: string[];
};

/**
 * Section tabs of the portal. The current one is worked out from the address here, on the client,
 * so the same bar can sit in the shared layout of every section and keep up with navigation
 * (audit N-03). A section without a live page is a disabled item with "скоро", never a dead link.
 */
export function PortalTabs({ items }: { items: PortalTab[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const live = items.flatMap((i) => (i.href ? [i] : []));
  const cur = activeIndex(
    live.map((i) => ({ href: i.href!, also: i.also })),
    pathname,
    params,
  );
  const current = cur >= 0 ? live[cur] : null;

  return (
    <ul className="flex min-w-0 flex-1 [scrollbar-width:none] gap-1 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
      {items.map((i) => (
        <li key={i.label} className="shrink-0">
          {i.href ? (
            <Link
              href={i.href}
              aria-current={i === current ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
                i === current
                  ? "bg-brand-600 text-on-brand"
                  : "hover:bg-brand-50"
              }`}
            >
              {i.label}
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="text-ink-muted flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm whitespace-nowrap opacity-80"
              title="Скоро"
            >
              {i.label}
              <span className="bg-line rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                скоро
              </span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
