import Link from "next/link";
import { Suspense } from "react";
import { isEnabled, type FlagName } from "@/lib/flags";
import { MinecraftAvatar } from "./minecraft-avatar";
import { PortalTabs, type PortalTab } from "./portal-tabs";

export type PortalNavItem = PortalTab;

type Leaf = { label: string; href: string; flag?: FlagName; also?: string[] };

/**
 * Sections of the portal, grouped like the top menu: a short first row of sections and, under it,
 * the pages of the section you are in. A section whose feature is switched off is left out, never
 * shown as a dead item (the quick actions on the dashboard say "скоро" for the map instead).
 */
const GROUPS: (Leaf & { children?: Leaf[] })[] = [
  { label: "Мой MineOrt", href: "/dashboard" },
  {
    label: "Общение",
    href: "/social",
    flag: "ff_p1a",
    children: [
      { label: "Лента", href: "/social" },
      { label: "Галерея", href: "/social/gallery" },
      { label: "Проекты", href: "/social/projects" },
      { label: "События", href: "/social/calendar", flag: "ff_p1b_social" },
      { label: "Голосования", href: "/social/polls", flag: "ff_p1b_social" },
    ],
  },
  {
    label: "Игроки",
    href: "/players",
    flag: "ff_p1a",
    also: ["/guilds"],
    children: [
      { label: "Игроки", href: "/players" },
      {
        label: "Гильдии",
        href: "/players?tab=guilds",
        flag: "ff_p1b_guilds",
        also: ["/guilds"],
      },
    ],
  },
  { label: "Гайдбук", href: "/guide" },
  { label: "Карта мира", href: "/map", flag: "ff_p1c_atlas" },
];

export function portalItems(): PortalNavItem[] {
  const on = (l: Leaf) => !l.flag || isEnabled(l.flag);
  return GROUPS.filter(on).map(({ children, ...g }) => {
    const kids = (children ?? []).filter(on);
    return {
      ...g,
      // one page is not a section: a group with a single child is just a link
      children: kids.length > 1 ? kids : undefined,
    };
  });
}

/**
 * What the bar shows while the address is being read (and in a statically built page, where it
 * cannot be known): the same tabs, none of them marked as current.
 */
function TabsFallback({ items }: { items: PortalNavItem[] }) {
  return (
    <ul className="flex min-w-0 flex-1 flex-wrap gap-1 pb-1">
      {items.map((i) => (
        <li key={i.label} className="shrink-0">
          <span className="text-ink-muted flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap">
            {i.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The same section bar for the shared layouts of social, players, guilds and the guide. */
export function SectionNav() {
  return (
    <nav
      aria-label="Разделы портала"
      className="mx-4 flex items-center gap-2 pt-1 sm:mx-8"
    >
      <Suspense fallback={<TabsFallback items={portalItems()} />}>
        <PortalTabs items={portalItems()} />
      </Suspense>
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
      <Suspense fallback={<TabsFallback items={items} />}>
        <PortalTabs items={items} />
      </Suspense>
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
