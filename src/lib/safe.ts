/**
 * Public pages must survive an unavailable data source (outage, missing config in CI):
 * the failure is logged and a neutral fallback is rendered instead of a 500.
 * Never use this for writes or for security decisions.
 */
export async function safely<T>(
  label: string,
  work: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    // Next.js uses exceptions for control flow (dynamic rendering, redirects, 404): never swallow them.
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (
      typeof digest === "string" &&
      (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE")
    )
      throw error;
    if (
      error instanceof Error &&
      /dynamic server usage|bail ?out/i.test(error.message)
    )
      throw error;
    console.error(
      `[safely] ${label} failed:`,
      error instanceof Error ? error.message : error,
    );
    return fallback;
  }
}
