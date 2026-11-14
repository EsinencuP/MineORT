import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-line text-ink-muted mx-4 mt-10 flex flex-wrap items-center justify-between gap-3 border-t py-6 text-sm sm:mx-8">
      <p>MineOrt IV · сообщество Minecraft</p>
      <nav
        aria-label="Служебные ссылки"
        className="flex flex-wrap gap-x-5 gap-y-1"
      >
        <Link
          href="/rules"
          className="hover:text-ink underline-offset-4 hover:underline"
        >
          Правила
        </Link>
        <Link
          href="/guide"
          className="hover:text-ink underline-offset-4 hover:underline"
        >
          Как играть
        </Link>
        <Link
          href="/start"
          className="hover:text-ink underline-offset-4 hover:underline"
        >
          Подключение
        </Link>
      </nav>
    </footer>
  );
}
