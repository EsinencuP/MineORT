import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { isEnabled } from "@/lib/flags";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // The layout must not redirect to /admin/security itself (that page lives under it): each page checks TOTP.
  const user = await requireStaff(undefined, { allowWithoutTotp: true });
  const isAdmin = user.site_role === "admin";
  const links = [
    { href: "/admin/applications", label: "Заявки" },
    { href: "/admin/moderation", label: "Модерация" },
    ...(isAdmin
      ? [
          { href: "/admin/players", label: "Игроки" },
          { href: "/admin/invitations", label: "Приглашения" },
          ...(isEnabled("ff_p1b_guilds")
            ? [{ href: "/admin/guilds", label: "Гильдии" }]
            : []),
          { href: "/admin/rules", label: "Правила" },
          { href: "/admin/guides", label: "Гайдбук" },
          { href: "/admin/audit", label: "Аудит" },
        ]
      : []),
    { href: "/admin/security", label: "Безопасность" },
  ];
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <nav
        aria-label="Админ-панель"
        className="border-line mb-6 flex flex-wrap gap-1 border-b pb-3"
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="hover:bg-surface flex min-h-11 items-center rounded-lg px-3 font-medium"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
