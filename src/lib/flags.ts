import { notFound } from "next/navigation";
import { connection } from "next/server";

/**
 * Feature flags for release waves (US-E00-05). P0 is never flagged.
 * Source: environment variables `FF_<NAME>=true|1|on`, read on the server per request.
 * Module flags only count when their wave flag is also on.
 */
export const WAVE_FLAGS = ["ff_p1a", "ff_p1b", "ff_p1c"] as const;

const MODULE_WAVE = {
  ff_p1b_guilds: "ff_p1b",
  ff_p1b_social: "ff_p1b",
  ff_p1c_atlas: "ff_p1c",
  ff_p1c_requests: "ff_p1c",
  ff_social_comments: "ff_p1a",
} as const;

export type WaveFlag = (typeof WAVE_FLAGS)[number];
export type ModuleFlag = keyof typeof MODULE_WAVE;
export type FlagName = WaveFlag | ModuleFlag;

type Env = Record<string, string | undefined>;

function readEnv(name: FlagName, env: Env): boolean {
  const value = env[name.toUpperCase()]?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "on";
}

export function isEnabled(
  flag: FlagName | undefined,
  env: Env = process.env,
): boolean {
  if (!flag) return true;
  if (!readEnv(flag, env)) return false;
  if (flag in MODULE_WAVE) {
    return readEnv(MODULE_WAVE[flag as ModuleFlag], env);
  }
  return true;
}

/** Page/layout guard: disabled flag renders the standard 404, no redirect. */
export async function requireFlag(flag: FlagName): Promise<void> {
  await connection(); // opt into per-request rendering so env changes apply without a rebuild
  if (!isEnabled(flag)) notFound();
}

/** Route handler guard: returns a 404 response when the flag is off, otherwise null. */
export function flagGuard(flag: FlagName, env: Env = process.env) {
  return isEnabled(flag, env)
    ? null
    : new Response(null, { status: 404, statusText: "Not Found" });
}
