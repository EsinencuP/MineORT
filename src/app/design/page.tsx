import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { previewAllowed } from "@/lib/design-preview";
import { SCREENS } from "./states";

export const metadata: Metadata = { title: "Макеты состояний" };

export default function DesignIndex() {
  if (!previewAllowed()) notFound();
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
      <p className="eyebrow">Дизайн</p>
      <h1 className="mt-2 text-3xl">Состояния экранов</h1>
      <p className="text-ink-muted mt-3 max-w-2xl">
        Каждое состояние трёх экранов из ТЗ на демонстрационных данных. Рабочие
        страницы показывают только реальные данные; здесь формы отключены. Тему
        можно переключить кнопкой в шапке.
      </p>
      {SCREENS.map((s) => (
        <section key={s.id} aria-labelledby={`h-${s.id}`} className="mt-8">
          <h2 id={`h-${s.id}`} className="text-2xl">
            {s.title}{" "}
            <span className="text-ink-muted font-sans text-sm font-normal">
              {s.route}
            </span>
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {s.states.map((st) => (
              <li key={st.id}>
                <Link
                  href={`/design/${s.id}/${st.id}`}
                  className="border-line bg-surface hover:bg-brand-50 lift block rounded-2xl border px-4 py-3"
                >
                  <span className="font-semibold">{st.title}</span>
                  <span className="text-ink-muted block text-sm">
                    {st.note}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
