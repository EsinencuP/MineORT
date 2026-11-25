import { CHUNK_CODEC_VERSION, decodeChunk } from "./chunk-codec";

export const MAX_CHUNKS_PER_BATCH = 50;
const BORDER_CHUNKS = 1_875_000;
const DIMENSIONS = new Set(["overworld", "nether"]);

export type IncomingChunk = {
  dim: "overworld" | "nether";
  cx: number;
  cz: number;
  codec: number;
  version: number;
  data: string; // base64 of the zlib payload, already checked to decode
};

export type RejectedChunk = {
  dim: unknown;
  cx: unknown;
  cz: unknown;
  code: "ERR_BAD_CHUNK" | "ERR_CODEC_UNSUPPORTED";
};

/**
 * Validates a plugin batch chunk by chunk. A bad chunk is reported and skipped so it cannot hold up
 * the good ones; a repeat of the same chunk keeps only its newest version.
 */
export function parseChunkBatch(raw: unknown[]): {
  accepted: IncomingChunk[];
  rejected: RejectedChunk[];
} {
  if (raw.length === 0 || raw.length > MAX_CHUNKS_PER_BATCH) {
    throw new Error(`batch must hold 1 to ${MAX_CHUNKS_PER_BATCH} chunks`);
  }
  const newest = new Map<string, IncomingChunk>();
  const rejected: RejectedChunk[] = [];

  for (const item of raw) {
    const c = (item ?? {}) as Record<string, unknown>;
    const reject = (code: RejectedChunk["code"]) =>
      rejected.push({ dim: c.dim, cx: c.cx, cz: c.cz, code });

    if (
      typeof c.dim !== "string" ||
      !DIMENSIONS.has(c.dim) ||
      !Number.isInteger(c.cx) ||
      !Number.isInteger(c.cz) ||
      Math.abs(c.cx as number) > BORDER_CHUNKS ||
      Math.abs(c.cz as number) > BORDER_CHUNKS ||
      !Number.isSafeInteger(c.version) ||
      (c.version as number) < 0 ||
      typeof c.data !== "string"
    ) {
      reject("ERR_BAD_CHUNK");
      continue;
    }
    if (c.codec !== CHUNK_CODEC_VERSION) {
      reject("ERR_CODEC_UNSUPPORTED");
      continue;
    }
    try {
      decodeChunk(Buffer.from(c.data, "base64"));
    } catch {
      reject("ERR_BAD_CHUNK");
      continue;
    }

    const chunk = c as unknown as IncomingChunk;
    const key = `${chunk.dim}:${chunk.cx}:${chunk.cz}`;
    const seen = newest.get(key);
    if (!seen || seen.version < chunk.version) newest.set(key, chunk);
  }
  return { accepted: [...newest.values()], rejected };
}
