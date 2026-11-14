import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();
  const isAdmin = user.site_role === "admin";
  const links = [
    { href: "/admin/applications", label: "Заявки" },
    ...(isAdmin
      ? [
          { href: "/admin/invitations", label: "Приглашения" },
          { href: "/admin/rules", label: "Правила" },
          { href: "/admin/guides", label: "Гайдбук" },
          { href: "/admin/audit", label: "Аудит" },
        ]
      : []),
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
