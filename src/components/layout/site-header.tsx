import Link from "next/link";
import { connection } from "next/server";
import { visibleMenu } from "@/lib/menu";
import { ButtonLink } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  await connection();
  const items = visibleMenu();

  return (
    <header className="border-line bg-paper sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
        <Link
          href="/"
          className="text-brand-700 text-base font-bold whitespace-nowrap sm:text-lg"
        >
          MineOrt IV
        </Link>

        <nav aria-label="Главное меню" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.href + item.label} className="group relative">
                <Link
                  href={item.href}
                  className="hover:bg-surface flex min-h-11 items-center rounded-lg px-3 font-medium"
                >
                  {item.label}
                </Link>
                {item.children && (
                  <ul className="border-line bg-paper invisible absolute top-full left-0 min-w-52 rounded-lg border p-1 shadow-lg group-focus-within:visible group-hover:visible">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className="hover:bg-surface flex min-h-11 items-center rounded-md px-3"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden lg:block">
            <ButtonLink href="/start">Начать играть</ButtonLink>
          </div>
          <ButtonLink href="/login" variant="secondary" className="px-3">
            Войти
          </ButtonLink>
          <MobileNav items={items} />
        </div>
      </div>
    </header>
  );
}
