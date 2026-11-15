export type NavTarget = {
  /** Path with an optional query, e.g. "/players?tab=guilds". */
  href: string;
  /** Other path prefixes that belong to the same section (a guild page belongs to "Гильдии"). */
  also?: readonly string[];
};

const onPath = (pathname: string, base: string) =>
  base === "/"
    ? pathname === "/"
    : pathname === base || pathname.startsWith(`${base}/`);

function score(t: NavTarget, pathname: string, params: URLSearchParams) {
  const [path, query] = t.href.split("?");
  if (query && onPath(pathname, path)) {
    const want = new URLSearchParams(query);
    if ([...want].every(([k, v]) => params.get(k) === v))
      return 1000 + path.length;
  }
  let best = 0;
  for (const prefix of t.also ?? [])
    if (onPath(pathname, prefix)) best = Math.max(best, 500 + prefix.length);
  if (!query && onPath(pathname, path)) best = Math.max(best, path.length + 1);
  return best;
}

/**
 * The one item of a list that matches the current address best, or -1. The most specific match
 * wins ("/social/gallery" beats "/social"; "/players?tab=guilds" beats "/players"), so exactly one
 * item of a menu is marked as the current page.
 */
export function activeIndex(
  items: readonly NavTarget[],
  pathname: string,
  params: URLSearchParams,
): number {
  let best = -1;
  let bestScore = 0;
  items.forEach((t, i) => {
    const s = score(t, pathname, params);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  });
  return best;
}
