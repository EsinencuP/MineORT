/** Query parameter that carries the list a detail page was opened from. */
export const BACK_PARAM = "back";

/** Control characters and backslashes: browsers normalise them away, which can smuggle in "//host". */
function hasUnsafeChar(value: string) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

/**
 * A "back to the list" target taken from the address bar. Only same-site paths under one of
 * `allowed` are accepted (never a full URL, a protocol-relative one or anything with control
 * characters), so the parameter cannot turn a link into an open redirect. Returns null otherwise.
 */
export function safeBack(
  value: unknown,
  allowed: readonly string[],
): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 400)
    return null;
  // Browsers drop tabs and newlines inside URLs, so "/<TAB>/evil" would turn into "//evil".
  if (hasUnsafeChar(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  const probe = "https://placeholder.invalid";
  try {
    const u = new URL(value, probe);
    if (u.origin !== probe) return null;
    const ok = allowed.some(
      (p) => u.pathname === p || u.pathname.startsWith(`${p}/`),
    );
    return ok ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

/** Adds the list address to a detail link so the way back keeps filters, search and page. */
export function withBack(href: string, back: string | null | undefined) {
  if (!back) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}${BACK_PARAM}=${encodeURIComponent(back)}`;
}
