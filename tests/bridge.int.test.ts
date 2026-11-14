/* eslint-disable @typescript-eslint/no-explicit-any -- test helpers parse loosely typed JSON */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalRequest, hmacHex } from "@/lib/bridge/auth";
import { publicKeyBase64, verifyCanonical } from "@/lib/bridge/crypto";
import { canonicalize } from "@/lib/bridge/jcs";
import {
  createBridgeServer,
  issueBridgeKey,
  revokeBridgeKey,
} from "@/lib/bridge/keys";
import { enqueueAction } from "@/lib/bridge/queue";
import {
  getWhitelistState,
  onMembershipApproved,
} from "@/lib/bridge/whitelist";
import { upsertTelegramUser } from "@/lib/auth/store";
import { db } from "@/lib/supabase-admin";
import { POST as heartbeat } from "@/app/api/bridge/v1/heartbeat/route";
import { POST as lease } from "@/app/api/bridge/v1/actions/lease/route";
import { POST as result } from "@/app/api/bridge/v1/actions/[id]/result/route";
import { POST as events } from "@/app/api/bridge/v1/events/route";
import { POST as reconcileRoute } from "@/app/api/bridge/v1/reconcile/route";

// Integration tests against a real Supabase project (service key + bridge keys in the environment).
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.BRIDGE_KEK &&
  !!process.env.BRIDGE_ED25519_PRIVATE_KEY;

const BASE = "http://localhost/api/bridge/v1";
const userIds: string[] = [];
let serverId = "";
let keyA = { keyId: "", secret: "" };

type Sign = {
  keyId: string;
  secret: string;
  ts?: number;
  nonce?: string;
  version?: string;
  badSig?: boolean;
};

/** Builds a request the way the Bridge plugin does. */
function bridgeRequest(path: string, body: unknown, s: Sign) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = String(s.ts ?? Math.floor(Date.now() / 1000));
  const nonce = s.nonce ?? randomBytes(16).toString("hex");
  const sig = s.badSig
    ? "0".repeat(64)
    : hmacHex(
        s.secret,
        canonicalRequest("POST", `/api/bridge/v1${path}`, ts, nonce, raw),
      );
  const headers: Record<string, string> = {
    "x-mineort-key-id": s.keyId,
    "x-mineort-timestamp": ts,
    "x-mineort-nonce": nonce,
    "x-mineort-signature": sig,
    "content-type": "application/json",
  };
  if (s.version) headers["x-mineort-bridge-version"] = s.version;
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: raw,
  });
}
const asA = (over: Partial<Sign> = {}): Sign => ({ ...keyA, ...over });
const json = async (r: Response) => ({
  status: r.status,
  body: (await r.json()) as Record<string, any>,
});

async function leaseAll(s: Sign = asA(), max = 20) {
  const r = await json(
    await lease(bridgeRequest("/actions/lease", { max }, s)),
  );
  return r.body.actions as {
    action_id: string;
    attempt: number;
    type: string;
    args: any;
    signed_payload: string;
    signature: string;
    sig_kid: string;
    issued_at: string;
    expires_at: string | null;
  }[];
}
async function report(
  actionId: string,
  body: Record<string, unknown>,
  s: Sign = asA(),
) {
  const path = `/actions/${actionId}/result`;
  return json(
    await result(bridgeRequest(path, body, s), {
      params: Promise.resolve({ id: actionId }),
    } as never),
  );
}
const nick = () => "B" + randomUUID().replace(/-/g, "").slice(0, 9);
const settle = () =>
  db()
    .from("server_actions")
    .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
    .eq("server_id", serverId);

async function approvedUser(nickname: string) {
  const { userId } = await upsertTelegramUser({
    telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
    username: null,
    name: "it",
  });
  userIds.push(userId);
  await db().from("minecraft_identities").insert({ user_id: userId, nickname });
  await db().from("access_memberships").insert({
    user_id: userId,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  return userId;
}

describe.skipIf(!enabled)("Bridge API v1 (staging)", () => {
  beforeAll(async () => {
    serverId = await createBridgeServer("it-" + randomUUID().slice(0, 8));
    keyA = await issueBridgeKey(serverId, "A");
  });

  afterAll(async () => {
    const { data: acts } = await db()
      .from("server_actions")
      .select("id")
      .eq("server_id", serverId);
    const ids = (acts ?? []).map((a) => a.id);
    if (ids.length)
      await db().from("server_action_attempts").delete().in("action_id", ids);
    await db().from("server_actions").delete().eq("server_id", serverId);
    await db().from("server_events").delete().eq("server_id", serverId);
    await db().from("whitelist_drift").delete().eq("server_id", serverId);
    await db().from("whitelist_entries").delete().in("user_id", userIds);
    await db().from("access_memberships").delete().in("user_id", userIds);
    await db().from("minecraft_identities").delete().in("user_id", userIds);
    await db().from("telegram_identities").delete().in("user_id", userIds);
    await db().from("users").delete().in("id", userIds);
    await db().from("bridge_keys").delete().eq("server_id", serverId);
    await db().from("bridge_servers").delete().eq("id", serverId);
  });

  describe("request authentication (TC-OPS-04)", () => {
    it("rejects missing, forged and unknown-key signatures with the same answer", async () => {
      const a = await json(
        await heartbeat(
          new NextRequest(`${BASE}/heartbeat`, { method: "POST", body: "{}" }),
        ),
      );
      const b = await json(
        await heartbeat(bridgeRequest("/heartbeat", {}, asA({ badSig: true }))),
      );
      const c = await json(
        await heartbeat(
          bridgeRequest(
            "/heartbeat",
            {},
            { keyId: "deadbeefdeadbeef", secret: "x" },
          ),
        ),
      );
      for (const r of [a, b, c])
        expect(r).toMatchObject({ status: 401, body: { error: "ERR_AUTH" } });
      expect(b.body).toEqual({ ...c.body, server_time: b.body.server_time });
    });

    it("accepts a signed heartbeat and records the server as online; every answer has server_time", async () => {
      const r = await json(
        await heartbeat(
          bridgeRequest(
            "/heartbeat",
            { bridge_version: "1.0.0", server_version: "Paper 26.3" },
            asA(),
          ),
        ),
      );
      expect(r.status).toBe(200);
      expect(r.body.server_time).toBeGreaterThan(1_700_000_000);
      const { data } = await db()
        .from("bridge_servers")
        .select("status, bridge_version")
        .eq("id", serverId)
        .single();
      expect(data).toMatchObject({ status: "online", bridge_version: "1.0.0" });
    });

    it("rejects a timestamp outside +-60 s and reports server_time for correction", async () => {
      const old = await json(
        await heartbeat(
          bridgeRequest(
            "/heartbeat",
            {},
            asA({ ts: Math.floor(Date.now() / 1000) - 120 }),
          ),
        ),
      );
      expect(old).toMatchObject({
        status: 401,
        body: { error: "ERR_TS_SKEW" },
      });
      expect(old.body.server_time).toBeDefined();
      const future = await json(
        await heartbeat(
          bridgeRequest(
            "/heartbeat",
            {},
            asA({ ts: Math.floor(Date.now() / 1000) + 120 }),
          ),
        ),
      );
      expect(future.body.error).toBe("ERR_TS_SKEW");
    });

    it("rejects a repeated nonce", async () => {
      const nonce = randomBytes(16).toString("hex");
      expect(
        (
          await json(
            await heartbeat(bridgeRequest("/heartbeat", {}, asA({ nonce }))),
          )
        ).status,
      ).toBe(200);
      const again = await json(
        await heartbeat(bridgeRequest("/heartbeat", {}, asA({ nonce }))),
      );
      expect(again).toMatchObject({
        status: 409,
        body: { error: "ERR_NONCE_REPLAY" },
      });
    });

    it("a tampered body fails the signature", async () => {
      const good = bridgeRequest("/actions/lease", { max: 1 }, asA());
      const forged = new NextRequest(good.url, {
        method: "POST",
        headers: good.headers,
        body: JSON.stringify({ max: 20 }),
      });
      expect((await json(await lease(forged))).body.error).toBe("ERR_AUTH");
    });

    it("two active keys work at once; a revoked key gets ERR_KEY_REVOKED", async () => {
      const keyB = await issueBridgeKey(serverId, "B");
      expect(
        (await json(await heartbeat(bridgeRequest("/heartbeat", {}, keyB))))
          .status,
      ).toBe(200);
      expect(
        (await json(await heartbeat(bridgeRequest("/heartbeat", {}, asA()))))
          .status,
      ).toBe(200);
      await revokeBridgeKey(keyB.keyId);
      expect(
        (await json(await heartbeat(bridgeRequest("/heartbeat", {}, keyB))))
          .body.error,
      ).toBe("ERR_KEY_REVOKED");
      expect(
        (await json(await heartbeat(bridgeRequest("/heartbeat", {}, asA()))))
          .status,
      ).toBe(200);
    });

    it("an outdated Bridge is refused everywhere except heartbeat", async () => {
      await db()
        .from("bridge_servers")
        .update({ min_bridge_version: "1.2.0" })
        .eq("id", serverId);
      const out = await json(
        await lease(
          bridgeRequest("/actions/lease", {}, asA({ version: "1.1.9" })),
        ),
      );
      expect(out).toMatchObject({
        status: 426,
        body: { error: "ERR_BRIDGE_OUTDATED" },
      });
      expect(
        (
          await json(
            await heartbeat(
              bridgeRequest("/heartbeat", {}, asA({ version: "1.1.9" })),
            ),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await json(
            await lease(
              bridgeRequest("/actions/lease", {}, asA({ version: "1.2.0" })),
            ),
          )
        ).status,
      ).toBe(200);
      await db()
        .from("bridge_servers")
        .update({ min_bridge_version: "0.0.0" })
        .eq("id", serverId);
    });
  });

  describe("action queue and signatures", () => {
    it("leased actions carry a valid Ed25519 signature over the canonical payload", async () => {
      const n = nick();
      const id = await enqueueAction({
        serverId,
        type: "whitelist.add",
        args: { nickname: n },
      });
      const acts = await leaseAll();
      const a = acts.find((x) => x.action_id === id)!;
      expect(a).toBeTruthy();
      expect(a.attempt).toBe(1);
      expect(a.sig_kid).toBe("k1");
      const pub = publicKeyBase64();
      expect(verifyCanonical(a.signed_payload, a.signature, pub)).toBe(true);
      const payload = JSON.parse(a.signed_payload);
      expect(payload).toMatchObject({
        action_id: id,
        server_id: serverId,
        type: "whitelist.add",
        args: { nickname: n },
      });
      expect(canonicalize(payload)).toBe(a.signed_payload); // canonical form
      const ttl =
        Date.parse(payload.expires_at) - Date.parse(payload.issued_at);
      expect(ttl).toBe(24 * 3600_000);
      // a changed argument no longer verifies
      const forged = canonicalize({ ...payload, args: { nickname: "Evil" } });
      expect(verifyCanonical(forged, a.signature, pub)).toBe(false);
      await report(id, { attempt: 1, status: "succeeded" });
    });

    it("an action is not handed out twice while leased; result is idempotent per attempt", async () => {
      const id = await enqueueAction({
        serverId,
        type: "whitelist.add",
        args: { nickname: nick() },
      });
      expect((await leaseAll()).some((x) => x.action_id === id)).toBe(true);
      expect((await leaseAll()).some((x) => x.action_id === id)).toBe(false);
      expect(
        (await report(id, { attempt: 1, status: "succeeded" })).status,
      ).toBe(200);
      expect(
        (await report(id, { attempt: 1, status: "succeeded" })).status,
      ).toBe(200); // repeat after a network error
      expect(
        (await report(id, { attempt: 2, status: "succeeded" })).body.error,
      ).toBe("ERR_LEASE_EXPIRED");
    });

    it("a lease that runs out is retried with backoff; whitelist.add gives up after 8 attempts", async () => {
      const id = await enqueueAction({
        serverId,
        type: "whitelist.add",
        args: { nickname: nick() },
      });
      for (let attempt = 1; attempt <= 8; attempt++) {
        await settle();
        const got = (await leaseAll()).find((x) => x.action_id === id);
        expect(got?.attempt, `attempt ${attempt}`).toBe(attempt);
        await report(id, {
          attempt,
          status: "failed",
          retryable: true,
          error_code: "ERR_TEST",
        });
      }
      const { data } = await db()
        .from("server_actions")
        .select("status, error_code")
        .eq("id", id)
        .single();
      expect(data).toMatchObject({ status: "failed", error_code: "ERR_TEST" });
    });

    it("revocation actions are never given up after 8 attempts", async () => {
      const id = await enqueueAction({
        serverId,
        type: "whitelist.remove",
        args: { nickname: nick() },
      });
      for (let attempt = 1; attempt <= 9; attempt++) {
        await settle();
        const got = (await leaseAll()).find((x) => x.action_id === id);
        expect(got?.attempt).toBe(attempt);
        await report(id, {
          attempt,
          status: "failed",
          retryable: true,
          error_code: "ERR_TEST",
        });
      }
      const { data } = await db()
        .from("server_actions")
        .select("status, expires_at")
        .eq("id", id)
        .single();
      expect(data).toEqual({ status: "failed_retryable", expires_at: null });
    });

    it("an expired lease counts as a failed attempt", async () => {
      const id = await enqueueAction({
        serverId,
        type: "whitelist.add",
        args: { nickname: nick() },
      });
      await leaseAll();
      await db()
        .from("server_actions")
        .update({ lease_until: new Date(Date.now() - 1000).toISOString() })
        .eq("id", id);
      await leaseAll(); // triggers the sweep
      const { data } = await db()
        .from("server_actions")
        .select("status, error_code")
        .eq("id", id)
        .single();
      expect(data).toMatchObject({
        status: "failed_retryable",
        error_code: "ERR_LEASE_EXPIRED",
      });
      // a late result for the same attempt is still accepted while nobody re-leased it
      expect(
        (await report(id, { attempt: 1, status: "succeeded" })).status,
      ).toBe(200);
    });

    it("whitelist.add past expires_at becomes expired and the entry shows failed", async () => {
      const n = nick();
      const user = await approvedUser(n);
      await onMembershipApproved(user);
      const { data: act } = await db()
        .from("server_actions")
        .select("id")
        .eq("user_id", user)
        .eq("type", "whitelist.add")
        .single();
      await db()
        .from("server_actions")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", act!.id);
      await leaseAll();
      const { data } = await db()
        .from("server_actions")
        .select("status")
        .eq("id", act!.id)
        .single();
      expect(data?.status).toBe("expired");
      expect((await getWhitelistState(user))?.applied_state).toBe("failed");
    });

    it("one whitelist action per nickname at a time, oldest first", async () => {
      const n = nick();
      const add = await enqueueAction({
        serverId,
        type: "whitelist.add",
        args: { nickname: n },
      });
      const remove = await enqueueAction({
        serverId,
        type: "whitelist.remove",
        args: { nickname: n },
      });
      const first = (await leaseAll()).filter((x) =>
        ([add, remove] as string[]).includes(x.action_id),
      );
      expect(first.map((x) => x.action_id)).toEqual([add]);
      await report(add, { attempt: 1, status: "succeeded" });
      const second = (await leaseAll()).filter((x) =>
        ([add, remove] as string[]).includes(x.action_id),
      );
      expect(second.map((x) => x.action_id)).toEqual([remove]);
      await report(remove, { attempt: 1, status: "succeeded" });
    });

    it("a paused server gets nothing and the flag; heartbeat does not unpause", async () => {
      await db()
        .from("bridge_servers")
        .update({ status: "paused", paused_reason: "key_revoked" })
        .eq("id", serverId);
      const id = await enqueueAction({
        serverId,
        type: "whitelist.add",
        args: { nickname: nick() },
      });
      const r = await json(
        await lease(bridgeRequest("/actions/lease", {}, asA())),
      );
      expect(r.body).toMatchObject({ actions: [], paused: true });
      const hb = await json(
        await heartbeat(bridgeRequest("/heartbeat", {}, asA())),
      );
      expect(hb.body.paused).toBe(true);
      const { data } = await db()
        .from("bridge_servers")
        .select("status")
        .eq("id", serverId)
        .single();
      expect(data?.status).toBe("paused");
      await db()
        .from("bridge_servers")
        .update({ status: "online", paused_reason: null })
        .eq("id", serverId);
      await db()
        .from("server_actions")
        .update({ status: "cancelled" })
        .eq("id", id);
    });

    it("only whitelisted action types can be issued", async () => {
      await expect(
        enqueueAction({ serverId, type: "op.give", args: {} }),
      ).rejects.toThrow(/not allowed/);
    });
  });

  describe("approval pipeline (honest status)", () => {
    it("approval queues whitelist.add; access is ready only after the server confirms", async () => {
      const n = nick();
      const user = await approvedUser(n);
      expect((await onMembershipApproved(user)).queued).toBeGreaterThanOrEqual(
        1,
      );
      expect((await onMembershipApproved(user)).queued).toBe(0); // idempotent
      expect(await getWhitelistState(user)).toMatchObject({
        desired: "on",
        applied_state: "pending",
      });

      const act = (await leaseAll()).find((x) => x.args.nickname === n)!;
      expect(await getWhitelistState(user)).toMatchObject({
        applied_state: "pending",
      }); // leased is not applied
      await report(act.action_id, {
        attempt: act.attempt,
        status: "succeeded",
      });
      expect(await getWhitelistState(user)).toMatchObject({
        applied_state: "applied",
      });
    });

    it("a result updates the entry of the action's user, not another user with the same nickname", async () => {
      const n = nick();
      const user = await approvedUser(n);
      const other = await approvedUser(nick());
      await db().from("whitelist_entries").insert({
        user_id: other,
        nickname: n.toLowerCase(),
        desired: "on",
        applied_state: "pending",
      });
      await onMembershipApproved(user);
      const act = (await leaseAll()).find((x) => x.args.nickname === n)!;
      await report(act.action_id, {
        attempt: act.attempt,
        status: "succeeded",
      });
      expect((await getWhitelistState(user))?.applied_state).toBe("applied");
      expect((await getWhitelistState(other))?.applied_state).toBe("pending");
    });

    it("applied needs every server to finish its whitelist.add", async () => {
      const second = await createBridgeServer(
        "it2-" + randomUUID().slice(0, 8),
      );
      const keyTwo = await issueBridgeKey(second, "A");
      try {
        const n = nick();
        const user = await approvedUser(n);
        await onMembershipApproved(user);
        const first = (await leaseAll()).find((x) => x.args.nickname === n)!;
        await report(first.action_id, {
          attempt: first.attempt,
          status: "succeeded",
        });
        expect((await getWhitelistState(user))?.applied_state).toBe("pending"); // the other server has not confirmed

        const other = (await leaseAll(keyTwo)).find(
          (x) => x.args.nickname === n,
        )!;
        await report(
          other.action_id,
          { attempt: other.attempt, status: "succeeded" },
          keyTwo,
        );
        expect((await getWhitelistState(user))?.applied_state).toBe("applied");
      } finally {
        const { data: acts } = await db()
          .from("server_actions")
          .select("id")
          .eq("server_id", second);
        const ids = (acts ?? []).map((x) => x.id);
        if (ids.length)
          await db()
            .from("server_action_attempts")
            .delete()
            .in("action_id", ids);
        await db().from("server_actions").delete().eq("server_id", second);
        await db().from("bridge_keys").delete().eq("server_id", second);
        await db().from("bridge_servers").delete().eq("id", second);
      }
    });

    it("a changed nickname takes the old one off the server", async () => {
      const oldNick = nick();
      const user = await approvedUser(oldNick);
      await db().from("whitelist_entries").insert({
        user_id: user,
        nickname: oldNick,
        desired: "on",
        applied_state: "applied",
      });
      const newNick = nick();
      await db()
        .from("minecraft_identities")
        .update({ nickname: newNick })
        .eq("user_id", user); // an admin-driven change
      await onMembershipApproved(user);
      const { data } = await db()
        .from("server_actions")
        .select("type, args")
        .eq("user_id", user)
        .eq("server_id", serverId);
      const kinds = (data ?? [])
        .map((a) => `${a.type}:${(a.args as { nickname: string }).nickname}`)
        .sort();
      expect(kinds).toEqual(
        [`whitelist.add:${newNick}`, `whitelist.remove:${oldNick}`].sort(),
      );
      expect(await getWhitelistState(user)).toMatchObject({
        applied_state: "pending",
      });
    });

    it("an old nickname that now belongs to someone else is not removed", async () => {
      const oldNick = nick();
      const user = await approvedUser(oldNick);
      await db().from("whitelist_entries").insert({
        user_id: user,
        nickname: oldNick,
        desired: "on",
        applied_state: "applied",
      });
      await db()
        .from("minecraft_identities")
        .update({ binding_status: "released" })
        .eq("user_id", user);
      await db()
        .from("minecraft_identities")
        .insert({ user_id: user, nickname: nick() });
      const newOwner = await approvedUser(oldNick); // the nickname was re-issued to another player
      await onMembershipApproved(user);
      const { data } = await db()
        .from("server_actions")
        .select("type, args")
        .eq("server_id", serverId)
        .in("user_id", [user, newOwner])
        .eq("type", "whitelist.remove");
      expect(data ?? []).toHaveLength(0);
    });

    it("with the server offline the action stays pending", async () => {
      const user = await approvedUser(nick());
      await onMembershipApproved(user);
      await new Promise((r) => setTimeout(r, 300));
      expect((await getWhitelistState(user))?.applied_state).toBe("pending");
    });

    it("nothing is queued without an approved membership, active account or nickname", async () => {
      const { userId } = await upsertTelegramUser({
        telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
        username: null,
        name: "it",
      });
      userIds.push(userId);
      expect((await onMembershipApproved(userId)).queued).toBe(0);
      await db()
        .from("minecraft_identities")
        .insert({ user_id: userId, nickname: nick() });
      expect((await onMembershipApproved(userId)).queued).toBe(0);
    });
  });

  describe("reconciliation", () => {
    it("adds missing, confirms present, finishes revocations, records unknown entries as drift", async () => {
      const missing = nick();
      const present = nick();
      const revoked = nick();
      const stranger = nick();
      const uMissing = await approvedUser(missing);
      const uPresent = await approvedUser(present);
      const uRevoked = await approvedUser(revoked);
      for (const [u, n, desired] of [
        [uMissing, missing, "on"],
        [uPresent, present, "on"],
        [uRevoked, revoked, "off"],
      ] as const) {
        await db().from("whitelist_entries").insert({
          user_id: u,
          nickname: n,
          desired,
          applied_state: "applied",
        });
      }
      const r = await json(
        await reconcileRoute(
          bridgeRequest(
            "/reconcile",
            {
              entries: [
                { nickname: present },
                { nickname: revoked.toLowerCase() },
                { nickname: stranger },
              ],
            },
            asA(),
          ),
        ),
      );
      expect(r.status).toBe(200);

      expect((await getWhitelistState(uPresent))?.applied_state).toBe(
        "applied",
      ); // B
      expect((await getWhitelistState(uMissing))?.applied_state).toBe("drift"); // A
      const { data: add } = await db()
        .from("server_actions")
        .select("type, status")
        .eq("user_id", uMissing)
        .eq("type", "whitelist.add");
      expect(add).toHaveLength(1);
      const { data: rem } = await db()
        .from("server_actions")
        .select("type")
        .eq("user_id", uRevoked)
        .eq("type", "whitelist.remove"); // C-1 case-insensitive
      expect(rem).toHaveLength(1);
      const { data: dr } = await db()
        .from("whitelist_drift")
        .select("nickname, resolution")
        .eq("server_id", serverId)
        .ilike("nickname", stranger); // C-2: never auto-deleted
      expect(dr).toEqual([{ nickname: stranger, resolution: "open" }]);
      const { data: none } = await db()
        .from("server_actions")
        .select("id")
        .eq("type", "whitelist.remove")
        .filter("args->>nickname", "eq", stranger);
      expect(none).toHaveLength(0);

      // repeating the snapshot does not pile up duplicates
      await reconcileRoute(
        bridgeRequest(
          "/reconcile",
          {
            entries: [
              { nickname: present },
              { nickname: revoked.toLowerCase() },
              { nickname: stranger },
            ],
          },
          asA(),
        ),
      );
      const { data: add2 } = await db()
        .from("server_actions")
        .select("id")
        .eq("user_id", uMissing)
        .eq("type", "whitelist.add");
      expect(add2).toHaveLength(1);
      const { data: dr2 } = await db()
        .from("whitelist_drift")
        .select("id")
        .eq("server_id", serverId)
        .ilike("nickname", stranger);
      expect(dr2).toHaveLength(1);
    });

    it("rejects a malformed snapshot", async () => {
      const r = await json(
        await reconcileRoute(
          bridgeRequest(
            "/reconcile",
            { entries: [{ nickname: "bad nick!" }] },
            asA(),
          ),
        ),
      );
      expect(r).toMatchObject({
        status: 400,
        body: { error: "ERR_BAD_REQUEST" },
      });
    });
  });

  describe("events", () => {
    it("is idempotent by (server_id, event_id); unknown types are rejected", async () => {
      const e1 = randomUUID();
      const batch = {
        events: [
          {
            event_id: e1,
            type: "player.join",
            occurred_at: new Date().toISOString(),
            nickname: "Steve",
            account_type: "offline",
          },
          {
            event_id: randomUUID(),
            type: "marker.create_requested",
            occurred_at: new Date().toISOString(),
            nickname: "Steve",
          },
          {
            event_id: randomUUID(),
            type: "evil.type",
            occurred_at: new Date().toISOString(),
          },
        ],
      };
      const first = await json(
        await events(bridgeRequest("/events", batch, asA())),
      );
      expect(first.body.results.map((x: any) => x.result)).toEqual([
        "accepted",
        "accepted",
        "rejected",
      ]);
      const again = await json(
        await events(
          bridgeRequest("/events", { events: [batch.events[0]] }, asA()),
        ),
      );
      expect(again.body.results[0].result).toBe("duplicate");
      const { data } = await db()
        .from("server_events")
        .select("id")
        .eq("server_id", serverId)
        .eq("event_id", e1);
      expect(data).toHaveLength(1);
    });

    it("limits a batch to 100 events", async () => {
      const many = Array.from({ length: 101 }, () => ({
        event_id: randomUUID(),
        type: "player.quit",
        occurred_at: new Date().toISOString(),
      }));
      expect(
        (
          await json(
            await events(bridgeRequest("/events", { events: many }, asA())),
          )
        ).status,
      ).toBe(400);
    });
  });
});
