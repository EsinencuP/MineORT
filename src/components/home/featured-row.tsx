"use client";

import { useRef } from "react";
import { circleClass } from "@/components/ui/button";
import { ArrowRight } from "@/components/ui/icons";

export type FeaturedItem = { src: string; alt: string };

/** Horizontal row of world cards with a round "next" button, like the reference's featured strip. */
export function FeaturedRow({ items }: { items: FeaturedItem[] }) {
  const ref = useRef<HTMLUListElement>(null);

  const next = () => {
    const el = ref.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    el.scrollTo({
      left: atEnd ? 0 : el.scrollLeft + el.clientWidth * 0.6,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative">
      <ul
        ref={ref}
        tabIndex={0}
        aria-label="Миры сервера"
        className="flex snap-x [scrollbar-width:none] gap-4 overflow-x-auto scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((it) => (
          <li
            key={it.src}
            className="art-bg aspect-[4/3] w-[62%] shrink-0 snap-start overflow-hidden rounded-3xl shadow-[var(--shadow-card)] sm:w-[calc(25%-12px)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.src}
              alt={it.alt}
              loading="lazy"
              className="size-full object-cover object-center"
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={next}
        aria-label="Показать следующие миры"
        className={`${circleClass} absolute top-1/2 right-2 -translate-y-1/2`}
      >
        <ArrowRight className="size-5" />
      </button>
    </div>
  );
}
