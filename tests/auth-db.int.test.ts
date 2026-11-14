import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/auth/crypto";
import {
  consumeLoginState,
  createLoginState,
  createSession,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  upsertTelegramUser,
  withinRateLimit,
} from "@/lib/auth/store";
import { db } from "@/lib/supabase-admin";

// Integration tests against a real Supabase project; need the service-role key (server only).
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const created: string[] = [];
const newTelegramId = () => String(7_000_000_000 + randomInt(1_000_000_000));

describe.skipIf(!enabled)("auth storage (staging)", () => {
  afterAll(async () => {
    for (const id of created) {
      await db().from("user_sessions").delete().eq("user_id", id);
      await db().from("telegram_identities").delete().eq("user_id", id);
      await db().from("users").delete().eq("id", id);
    }
  });

  it("login state is single use", async () => {
    const { state, nonce } = await createLoginState("/players");
    const first = await consumeLoginState(state);
    expect(first).toMatchObject({ nonce, return_to: "/players" });
    expect(await consumeLoginState(state)).toBeNull(); // replay
    expect(await consumeLoginState("unknown-state")).toBeNull();
  });

  it("expired login state is rejected", async () => {
    const state = randomUUID();
    await db()
      .from("login_states")
      .insert({
        state_hash: sha256Hex(state),
        nonce: "n",
        code_verifier: "v",
        expires_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      });
    expect(await consumeLoginState(state)).toBeNull();
  });

  it("rate limit: 10 allowed per minute, the 11th is denied", async () => {
    const key = `test:${randomUUID()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 11; i++)
      results.push(await withinRateLimit(key, 60, 10));
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
  });

  it("identity is the Telegram id: username change keeps the same profile (AC-25)", async () => {
    const tg = newTelegramId();
    const a = await upsertTelegramUser({
      telegramId: tg,
      username: "old_name",
      name: "N",
    });
    created.push(a.userId);
    expect(a.isNew).toBe(true);
    const b = await upsertTelegramUser({
      telegramId: tg,
      username: "new_name",
      name: "N",
    });
    expect(b).toEqual({ userId: a.userId, isNew: false });
    const { data } = await db()
      .from("telegram_identities")
      .select("username")
      .eq("telegram_id", tg)
      .single();
    expect(data?.username).toBe("new_name");
  });

  it("parallel first logins create exactly one user", async () => {
    const tg = newTelegramId();
    const rs = await Promise.all(
      Array.from({ length: 5 }, () =>
        upsertTelegramUser({ telegramId: tg, username: "p", name: "P" }),
      ),
    );
    created.push(rs[0].userId);
    expect(new Set(rs.map((r) => r.userId)).size).toBe(1);
    expect(rs.filter((r) => r.isNew).length).toBe(1);
  });

  it("sessions: valid, revoked, revoke-all, blocked account, admin 12h", async () => {
    const { userId } = await upsertTelegramUser({
      telegramId: newTelegramId(),
      username: "s",
      name: "S",
    });
    created.push(userId);
    const s1 = await createSession({ userId, ip: null, userAgent: "t" });
    const s2 = await createSession({
      userId,
      ip: "203.0.113.5",
      userAgent: "t",
    });
    expect(await resolveSession(s1.token)).toMatchObject({ userId });
    expect(await resolveSession("garbage")).toBeNull();

    await revokeSession(s1.token);
    expect(await resolveSession(s1.token)).toBeNull();
    expect(await resolveSession(s2.token)).not.toBeNull();

    const s3 = await createSession({ userId, ip: null, userAgent: null });
    await revokeAllSessions(userId);
    expect(await resolveSession(s2.token)).toBeNull();
    expect(await resolveSession(s3.token)).toBeNull();

    const admin = await createSession({
      userId,
      isAdmin: true,
      ip: null,
      userAgent: null,
    });
    expect(admin.expires.getTime() - Date.now()).toBeLessThanOrEqual(
      12 * 3600 * 1000,
    );
    await db()
      .from("users")
      .update({ account_status: "banned" })
      .eq("id", userId);
    expect(await resolveSession(admin.token)).toBeNull(); // banned user cannot use a session
  });

  it("append-only logs cannot be changed or truncated, even by the service role", async () => {
    const { data } = await db()
      .from("security_events")
      .insert({ type: "it_probe", severity: "info" })
      .select("id")
      .single();
    const upd = await db()
      .from("security_events")
      .update({ type: "tampered" })
      .eq("id", data!.id);
    expect(upd.error).not.toBeNull();
    const del = await db().from("security_events").delete().eq("id", data!.id);
    expect(del.error).not.toBeNull();
  });
});
