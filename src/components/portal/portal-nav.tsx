import Link from "next/link";
import { isEnabled, type FlagName } from "@/lib/flags";
import { MinecraftAvatar } from "./minecraft-avatar";
import { PortalTabs, type PortalTab } from "./portal-tabs";

export type PortalNavItem = PortalTab;

/** Sections of the portal. A section without a live page is shown as "скоро", never as a dead link. */
const SECTIONS: {
  label: string;
  href: string;
  flag?: FlagName;
  always?: boolean;
  also?: string[];
}[] = [
  { label: "Мой MineOrt", href: "/dashboard", always: true },
  { label: "Карта мира", href: "/map", flag: "ff_p1c_atlas" },
  { label: "Гайдбук", href: "/guide", always: true },
  { label: "События", href: "/social/calendar", flag: "ff_p1b_social" },
  { label: "Проекты", href: "/social/projects", flag: "ff_p1a" },
  { label: "Лента", href: "/social", flag: "ff_p1a" },
  { label: "Игроки", href: "/players", flag: "ff_p1a" },
  {
    label: "Гильдии",
    href: "/players?tab=guilds",
    flag: "ff_p1b_guilds",
    also: ["/guilds"],
  },
  { label: "Галерея", href: "/social/gallery", flag: "ff_p1a" },
  { label: "Голосования", href: "/social/polls", flag: "ff_p1b_social" },
];

export function portalItems(): PortalNavItem[] {
  return SECTIONS.map((s) => {
    const live = s.always || (s.flag && s.href && isEnabled(s.flag));
    return { label: s.label, href: live ? s.href : null, also: s.also };
  });
}

/** The same section bar for the shared layouts of social, players, guilds and the guide. */
export function SectionNav() {
  return (
    <nav
      aria-label="Разделы портала"
      className="mx-4 flex items-center gap-2 pt-1 sm:mx-8"
    >
      <PortalTabs items={portalItems()} />
    </nav>
  );
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
      <PortalTabs items={items} />
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
