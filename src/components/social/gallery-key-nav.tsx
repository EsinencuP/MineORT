"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** ← / → move between images, Esc returns to the grid (the page keeps working without JavaScript). */
export function GalleryKeyNav({
  prev,
  next,
  back,
}: {
  prev: string | null;
  next: string | null;
  back: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "ArrowLeft" && prev) router.push(prev);
      else if (e.key === "ArrowRight" && next) router.push(next);
      else if (e.key === "Escape") router.push(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, back, router]);
  return null;
}
