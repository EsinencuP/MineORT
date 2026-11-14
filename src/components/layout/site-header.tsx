import Link from "next/link";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { visibleMenu } from "@/lib/menu";
import { ButtonLink } from "@/components/ui/button";
import { ArrowUpRight } from "@/components/ui/icons";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

export function BrandMark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5"
      aria-label="MineOrt: на главную"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/art/cube.svg"
        alt=""
        width={34}
        height={34}
        className="size-7 sm:size-[34px]"
      />
      <span className="font-pixel text-ink text-xl leading-none whitespace-nowrap sm:text-2xl">
        MineOrt
      </span>
    </Link>
  );
}

export async function SiteHeader() {
  await connection();
  const items = visibleMenu();
  const user = await getCurrentUser().catch(() => null);

  return (
    <header className="relative z-20">
      <div className="flex min-h-[4.5rem] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-8">
        <BrandMark />

        <nav aria-label="Главное меню" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.href + item.label} className="group relative">
                <Link
                  href={item.href}
                  className="hover:bg-brand-50 flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium"
                >
                  {item.label}
                </Link>
                {item.children && (
                  <ul className="border-line bg-paper invisible absolute top-full left-0 z-30 min-w-56 rounded-2xl border p-1.5 shadow-[var(--shadow-card)] group-focus-within:visible group-hover:visible">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className="hover:bg-brand-50 flex min-h-11 items-center rounded-xl px-3 text-sm"
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
          <div className="hidden min-[380px]:block">
            <ThemeToggle />
          </div>
          <div className="hidden lg:block">
            <ButtonLink href="/start" className="min-h-11 px-5 text-sm">
              Начать играть
              <ArrowUpRight className="size-4" />
            </ButtonLink>
          </div>
          <ButtonLink
            href={user ? "/dashboard" : "/login"}
            variant="secondary"
            className="min-h-11 px-3.5 text-sm"
          >
            {user ? "Кабинет" : "Войти"}
          </ButtonLink>
          <MobileNav items={items} />
        </div>
      </div>
    </header>
  );
}
