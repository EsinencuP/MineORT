import Link from "next/link";

export type Crumb = { label: string; href?: string };

/**
 * Where the visitor is: Section › List › This page. The last item is the current page and is not a
 * link. `back` adds a separate "back to results" link that keeps the filters of the list the page
 * was opened from (audit N-04).
 */
export function Breadcrumbs({
  items,
  back,
}: {
  items: Crumb[];
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <nav aria-label="Вы здесь" className="min-w-0">
        <ol className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <li key={c.label + i} className="flex min-w-0 items-center gap-2">
                {i > 0 && <span aria-hidden="true">›</span>}
                {c.href && !last ? (
                  <Link
                    href={c.href}
                    className="hover:text-ink flex min-h-11 items-center underline-offset-4 hover:underline"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={`min-w-0 truncate ${last ? "text-ink font-medium" : ""}`}
                  >
                    {c.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {back && (
        <Link
          href={back.href}
          className="text-brand-700 flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
        >
          {back.label}
        </Link>
      )}
    </div>
  );
}
