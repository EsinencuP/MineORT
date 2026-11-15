import { isEnabled, type FlagName } from "./flags";

export type MenuItem = {
  label: string;
  href: string;
  flag?: FlagName;
  /** Other path prefixes that belong to this item (highlights it as the current section). */
  also?: string[];
  children?: MenuItem[];
};

/** Global menu per docs/01-product/01-information-architecture.md, section 3.1. */
export const MENU: MenuItem[] = [
  { label: "Главная", href: "/" },
  {
    label: "Общение",
    href: "/social",
    flag: "ff_p1a",
    children: [
      { label: "Лента и новости", href: "/social" },
      { label: "Галерея", href: "/social/gallery" },
      { label: "Проекты", href: "/social/projects" },
      {
        label: "Голосования",
        href: "/social/polls",
        flag: "ff_p1b_social",
      },
      {
        label: "Календарь",
        href: "/social/calendar",
        flag: "ff_p1b_social",
      },
      {
        label: "Заказы",
        href: "/social/requests?tab=orders",
        flag: "ff_p1c_requests",
      },
      {
        label: "Помощь",
        href: "/social/requests?tab=help",
        flag: "ff_p1c_requests",
      },
    ],
  },
  { label: "Как играть", href: "/guide" },
  { label: "Карта", href: "/map", flag: "ff_p1c_atlas" },
  {
    label: "Игроки",
    href: "/players",
    flag: "ff_p1a",
    also: ["/guilds"],
    children: [
      { label: "Каталог игроков", href: "/players" },
      {
        label: "Гильдии",
        href: "/players?tab=guilds",
        flag: "ff_p1b_guilds",
        also: ["/guilds"],
      },
    ],
  },
  { label: "Личный кабинет", href: "/dashboard" },
];

/** Drops items whose flag is off; a parent with no visible children becomes a plain link. */
export function visibleMenu(
  items: MenuItem[] = MENU,
  env: Record<string, string | undefined> = process.env,
): MenuItem[] {
  return items
    .filter((item) => isEnabled(item.flag, env))
    .map((item) => {
      if (!item.children) return item;
      const children = visibleMenu(item.children, env);
      return { ...item, children: children.length > 1 ? children : undefined };
    });
}
