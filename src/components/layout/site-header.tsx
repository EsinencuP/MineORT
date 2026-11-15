import Link from "next/link";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { visibleMenu } from "@/lib/menu";
import { ButtonLink } from "@/components/ui/button";
import { ArrowUpRight } from "@/components/ui/icons";
import { DesktopNav } from "./desktop-nav";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

export function BrandMark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5"
      aria-label="MineOrt V: на главную"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-160.webp"
        alt=""
        width={44}
        height={44}
        className="size-9 sm:size-11"
      />
      <span className="font-display text-ink text-lg leading-none whitespace-nowrap sm:text-2xl">
        MineOrt<span className="text-accent"> V</span>
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

        <DesktopNav items={items} />

        <div className="flex items-center gap-2">
          <div className="hidden min-[380px]:block">
            <ThemeToggle />
          </div>
          <div className="hidden lg:block">
            <ButtonLink
              href="/start"
              className="min-h-11 px-5 text-sm whitespace-nowrap"
            >
              Начать играть
              <ArrowUpRight className="size-4" />
            </ButtonLink>
          </div>
          <ButtonLink
            href={user ? "/dashboard" : "/login"}
            variant="secondary"
            className="min-h-11 px-3.5 text-sm whitespace-nowrap"
          >
            {user ? "Кабинет" : "Войти"}
          </ButtonLink>
          <MobileNav items={items} />
        </div>
      </div>
    </header>
  );
}
