import Link from "next/link";
import { isEnabled, type FlagName } from "@/lib/flags";
import { MinecraftAvatar } from "./minecraft-avatar";

export type PortalNavItem = {
  label: string;
  href: string | null;
  active?: boolean;
};

/** Sections of the portal. A section without a live page is shown as "скоро", never as a dead link. */
const SECTIONS: {
  label: string;
  href: string;
  flag?: FlagName;
  always?: boolean;
}[] = [
  { label: "Мой MineOrt", href: "/dashboard", always: true },
  { label: "Карта мира", href: "/map", flag: "ff_p1c_atlas" },
  { label: "Гайдбук", href: "/guide", always: true },
  { label: "События", href: "/social/calendar", flag: "ff_p1b_social" },
  { label: "Проекты", href: "" },
  { label: "Сообщество", href: "/social", flag: "ff_p1a" },
  { label: "Галерея", href: "/social/gallery", flag: "ff_p1a" },
  { label: "Голосования", href: "/social/polls", flag: "ff_p1b_social" },
];

export function portalItems(active = "/dashboard"): PortalNavItem[] {
  return SECTIONS.map((s) => {
    const live = s.always || (s.flag && s.href && isEnabled(s.flag));
    return {
      label: s.label,
      href: live ? s.href : null,
      active: s.href === active,
    };
  });
}

export function PortalNav({
  items,
  nick,
}: {
  items: PortalNavItem[];
  nick: string | null;
}) {
  return (
    <nav
      aria-label="Разделы портала"
      className="mx-4 flex items-center gap-2 sm:mx-8"
    >
      <ul className="flex min-w-0 flex-1 [scrollbar-width:none] gap-1 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <li key={i.label} className="shrink-0">
            {i.href ? (
              <Link
                href={i.href}
                aria-current={i.active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                  i.active ? "bg-brand-600 text-on-brand" : "hover:bg-brand-50"
                }`}
              >
                {i.label}
              </Link>
            ) : (
              <span
                className="text-ink-muted flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm"
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
      <div className="flex shrink-0 items-center gap-2">
        <span
          title="Уведомления появятся в ближайшем обновлении"
          className="border-line text-ink-muted inline-flex size-11 items-center justify-center rounded-full border"
          role="img"
          aria-label="Уведомления: скоро"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="currentColor"
            aria-hidden="true"
            shapeRendering="crispEdges"
          >
            <path d="M11 2h2v2h3v2h1v6h2v3h2v2H3v-2h2v-3h2V6h1V4h3zM10 19h4v2h-4z" />
          </svg>
        </span>
        <details className="relative">
          <summary
            className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full"
            aria-label="Меню профиля"
          >
            <MinecraftAvatar nick={nick} size={40} />
          </summary>
          <div className="border-line bg-paper absolute right-0 z-30 mt-2 w-52 rounded-2xl border p-1.5 shadow-[var(--shadow-card)]">
            <Link
              href="/dashboard#settings"
              className="hover:bg-brand-50 flex min-h-11 items-center rounded-xl px-3 text-sm"
            >
              Настройки
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="hover:bg-brand-50 flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm"
              >
                Выйти
              </button>
            </form>
          </div>
        </details>
      </div>
    </nav>
  );
}
