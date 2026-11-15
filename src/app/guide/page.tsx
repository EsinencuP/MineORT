import type { Metadata } from "next";
import Link from "next/link";
import {
  CATEGORIES,
  listPublished,
  searchPublished,
  sanitizeQuery,
} from "@/lib/guides/store";
import { withBack } from "@/lib/nav/back";
import { safely } from "@/lib/safe";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";

export const dynamic = "force-dynamic"; // reads the session and live data on every request

export const metadata: Metadata = { title: "Как играть" };

export default async function GuidePage({ searchParams }: PageProps<"/guide">) {
  const sp = await searchParams;
  const raw = typeof sp.q === "string" ? sp.q : "";
  const q = sanitizeQuery(raw);
  const searching = raw.trim() !== "";
  const results =
    searching && q
      ? await safely("guide search", () => searchPublished(q), [])
      : [];
  const all = searching ? [] : await safely("guide list", listPublished, []);
  // Articles opened from a search remember it, so "back" returns to the same results.
  const back = searching ? `/guide?q=${encodeURIComponent(raw.trim())}` : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Как играть</h1>
      <p className="text-ink-muted mb-6">
        Гайдбук: установка, подключение, моды и решение проблем.
      </p>

      <form role="search" method="get" className="mb-8 flex gap-2">
        <label htmlFor="guide-q" className="sr-only">
          Поиск по Гайдбуку
        </label>
        <input
          id="guide-q"
          name="q"
          defaultValue={raw}
          maxLength={60}
          placeholder="Например: установка"
          className="border-line bg-paper text-ink min-h-11 min-w-0 flex-1 rounded-lg border px-3"
        />
        <button
          type="submit"
          className="bg-brand-600 text-on-brand min-h-11 rounded-full px-5 font-semibold"
        >
          Найти
        </button>
      </form>

      {searching ? (
        <section aria-live="polite">
          <h2 className="mb-3 text-lg font-semibold">
            Результаты поиска: «{q || raw.trim()}»
          </h2>
          {results.length === 0 ? (
            <EmptyState
              title="Ничего не найдено"
              description="Попробуйте другое слово или посмотрите разделы ниже."
              action={
                <Link href="/guide" className="text-brand-700 underline">
                  Все разделы
                </Link>
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {results.map((a) => (
                <li key={a.id}>
                  <Link
                    href={withBack(`/guide/${a.slug}`, back)}
                    className="block"
                  >
                    <Card>
                      <p className="font-semibold">{a.title}</p>
                      {a.summary && (
                        <p className="text-ink-muted">{a.summary}</p>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : all.length === 0 ? (
        <EmptyState
          title="Статьи скоро появятся"
          description="Мы готовим инструкции."
        />
      ) : (
        CATEGORIES.map((c) => {
          const items = all.filter((a) => a.category === c.id);
          if (items.length === 0) return null;
          return (
            <section
              key={c.id}
              aria-labelledby={`cat-${c.id}`}
              className="mb-8"
            >
              <h2 id={`cat-${c.id}`} className="mb-3 text-xl font-semibold">
                {c.title}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {items.map((a) => (
                  <li key={a.id}>
                    <Link href={`/guide/${a.slug}`} className="block h-full">
                      <Card className="h-full">
                        <p className="font-semibold">{a.title}</p>
                        {a.summary && (
                          <p className="text-ink-muted">{a.summary}</p>
                        )}
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
