"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Gives up after this long so a link that never resolves cannot leave the page "busy" forever. */
const GIVE_UP_MS = 12_000;

/**
 * Instant feedback for client-side navigation: the moment an internal link is pressed a thin bar
 * runs under the top edge, the old content dims and the cursor shows progress, until the address
 * changes. Nothing is requested here; it only watches clicks (audit N-01).
 *
 * There is deliberately no root loading.tsx: a loading boundary starts streaming before the page
 * runs, which turns the redirect for guests (307) and every notFound() (404) into a 200.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}${search ? `?${search}` : ""}`;
  const hereRef = useRef(here);
  // The location a navigation started from; pending lasts while we are still on it.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const pending = startedAt !== null && startedAt === here;

  useEffect(() => {
    hereRef.current = here;
  }, [here]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        !e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download"))
        return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const target = `${url.pathname}${url.search}`;
      if (target === hereRef.current) return; // same page or a #hash jump: nothing to wait for
      setStartedAt(hereRef.current);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!pending) return;
    document.documentElement.dataset.navPending = "1";
    const t = window.setTimeout(() => setStartedAt(null), GIVE_UP_MS);
    return () => {
      delete document.documentElement.dataset.navPending;
      window.clearTimeout(t);
    };
  }, [pending]);

  return (
    <>
      {pending && (
        <div
          aria-hidden="true"
          data-nav-progress=""
          className="nav-progress pointer-events-none fixed inset-x-0 top-0 z-[70] h-1"
        />
      )}
      <span role="status" className="sr-only">
        {pending ? "Загружаем страницу…" : ""}
      </span>
    </>
  );
}
