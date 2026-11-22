/* eslint-disable @typescript-eslint/no-explicit-any -- test helpers parse loosely typed JSON */
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalRequest, hmacHex } from "@/lib/bridge/auth";
import { createBridgeServer, issueBridgeKey } from "@/lib/bridge/keys";
import { COLUMNS, encodeChunk } from "@/lib/map/chunk-codec";
import { db } from "@/lib/supabase-admin";
import { POST as chunksRoute } from "@/app/api/bridge/v1/map/chunks/route";

// Integration tests against a real Supabase project (service key + bridge keys in the environment).
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.BRIDGE_KEK;

const PATH = "/api/bridge/v1/map/chunks";
let serverId = "";
let key = { keyId: "", secret: "" };

function request(body: unknown, opts: { badSig?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const sig = opts.badSig
    ? "0".repeat(64)
    : hmacHex(key.secret, canonicalRequest("POST", PATH, ts, nonce, raw));
  return new NextRequest(`http://localhost${PATH}`, {
    method: "POST",
    headers: {
      "x-mineort-key-id": key.keyId,
      "x-mineort-timestamp": ts,
      "x-mineort-nonce": nonce,
      "x-mineort-signature": sig,
      "content-type": "application/json",
    },
    body: raw,
  });
}
const send = async (body: unknown, opts?: { badSig?: boolean }) => {
  const r = await chunksRoute(request(body, opts));
  return { status: r.status, body: (await r.json()) as Record<string, any> };
};

function chunk(cx: number, cz: number, version: number, height = 70) {
  const data = encodeChunk({
    columns: Array.from({ length: COLUMNS }, () => ({
      height,
      color: 0xff7fb238,
      waterDepth: 0,
    })),
  }).toString("base64");
  return { dim: "overworld", cx, cz, codec: 2, version, data };
}

const stored = async (cx: number, cz: number) => {
  const { data } = await db()
    .from("map_chunks")
    .select("version")
    .eq("server_id", serverId)
    .eq("dim", "overworld")
    .eq("cx", cx)
    .eq("cz", cz)
    .maybeSingle();
  return data?.version as number | undefined;
};
const region = async (rx: number, rz: number) => {
  const { data } = await db()
    .from("map_regions")
    .select("dirty, tile")
    .eq("server_id", serverId)
    .eq("dim", "overworld")
    .eq("rx", rx)
    .eq("rz", rz)
    .maybeSingle();
  return data as { dirty: boolean; tile: unknown } | null;
};

describe.skipIf(!enabled)("map chunk ingest", () => {
  beforeAll(async () => {
    serverId = await createBridgeServer(`map-int-${Date.now()}`);
    key = await issueBridgeKey(serverId, "A");
  });
  afterAll(async () => {
    await db().from("map_chunks").delete().eq("server_id", serverId);
    await db().from("map_regions").delete().eq("server_id", serverId);
    await db().from("bridge_keys").delete().eq("server_id", serverId);
    await db().from("bridge_servers").delete().eq("id", serverId);
  });

  it("stores a signed batch and builds each touched region", async () => {
    const batch = Array.from({ length: 50 }, (_, i) => chunk(i, 0, 10));
    const r = await send({ chunks: batch });
    expect(r.status).toBe(200);
    expect(r.body.results).toHaveLength(50);
    expect(r.body.results.every((x: any) => x.result === "stored")).toBe(true);
    expect(await stored(7, 0)).toBe(10);
    expect(await region(0, 0)).toMatchObject({ dirty: false });
    expect((await region(0, 0))!.tile).not.toBeNull();
    expect(await region(1, 0)).toMatchObject({ dirty: false }); // chunks 32..49 fall into region 1
  });

  it("puts negative chunk coordinates into the region below zero", async () => {
    await send({ chunks: [chunk(-1, -1, 10)] });
    expect(await region(-1, -1)).toMatchObject({ dirty: false });
    expect((await region(-1, -1))!.tile).not.toBeNull();
  });

  it("reports a repeated batch as stale and leaves the built region alone", async () => {
    await send({ chunks: [chunk(100, 100, 5)] });
    expect(await region(3, 3)).toMatchObject({ dirty: false });
    const again = await send({ chunks: [chunk(100, 100, 5)] });
    expect(again.body.results[0].result).toBe("stale");
    expect(await region(3, 3)).toMatchObject({ dirty: false });
  });

  it("does not let an older version overwrite a newer one", async () => {
    await send({ chunks: [chunk(200, 200, 20)] });
    const r = await send({ chunks: [chunk(200, 200, 10)] });
    expect(r.body.results[0].result).toBe("stale");
    expect(await stored(200, 200)).toBe(20);
  });

  it("replaces a chunk with a newer version", async () => {
    await send({ chunks: [chunk(300, 300, 1)] });
    const r = await send({ chunks: [chunk(300, 300, 2)] });
    expect(r.body.results[0].result).toBe("stored");
    expect(await stored(300, 300)).toBe(2);
  });

  it("answers 401 for a bad signature and writes nothing", async () => {
    const r = await send({ chunks: [chunk(400, 400, 1)] }, { badSig: true });
    expect(r.status).toBe(401);
    expect(await stored(400, 400)).toBeUndefined();
  });

  it("rejects an unsupported codec version and stores the other chunks", async () => {
    const r = await send({
      chunks: [{ ...chunk(500, 500, 1), codec: 99 }, chunk(501, 500, 1)],
    });
    expect(r.status).toBe(200);
    const byX = Object.fromEntries(r.body.results.map((x: any) => [x.cx, x]));
    expect(byX[500].result).toBe("rejected");
    expect(byX[500].code).toBe("ERR_CODEC_UNSUPPORTED");
    expect(byX[501].result).toBe("stored");
    expect(await stored(500, 500)).toBeUndefined();
  });

  it("answers 400 for an empty batch or a batch above the limit", async () => {
    expect((await send({ chunks: [] })).status).toBe(400);
    const over = Array.from({ length: 51 }, (_, i) => chunk(600 + i, 0, 1));
    expect((await send({ chunks: over })).status).toBe(400);
  });
});
