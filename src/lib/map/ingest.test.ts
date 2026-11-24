import { describe, expect, it } from "vitest";
import { encodeChunk, COLUMNS, type ChunkColumns } from "./chunk-codec";
import { MAX_CHUNKS_PER_BATCH, parseChunkBatch } from "./ingest";

function payload(height = 70): string {
  const chunk: ChunkColumns = {
    columns: Array.from({ length: COLUMNS }, () => ({
      height,
      color: 0xff7fb238,
      waterDepth: 0,
    })),
  };
  return encodeChunk(chunk).toString("base64");
}

const chunk = (over: Record<string, unknown> = {}) => ({
  dim: "overworld",
  cx: 0,
  cz: 0,
  codec: 2,
  version: 100,
  data: payload(),
  ...over,
});

describe("parseChunkBatch", () => {
  it("accepts a valid chunk and reports nothing rejected", () => {
    const r = parseChunkBatch([chunk()]);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected).toEqual([]);
  });

  it("keeps only the newest version when a batch repeats a chunk", () => {
    const r = parseChunkBatch([
      chunk({ version: 5, data: payload(60) }),
      chunk({ version: 9, data: payload(80) }),
      chunk({ version: 7, data: payload(70) }),
    ]);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].version).toBe(9);
  });

  it("rejects an unknown dimension", () => {
    const r = parseChunkBatch([chunk({ dim: "the_end" })]);
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0].code).toBe("ERR_BAD_CHUNK");
  });

  it("rejects chunk coordinates beyond the world border", () => {
    const r = parseChunkBatch([chunk({ cx: 1_875_001 })]);
    expect(r.rejected).toHaveLength(1);
  });

  it("rejects an unsupported codec version with its own code", () => {
    const r = parseChunkBatch([chunk({ codec: 1 })]);
    expect(r.rejected[0].code).toBe("ERR_CODEC_UNSUPPORTED");
  });

  it("rejects data that does not decode", () => {
    const r = parseChunkBatch([chunk({ data: "AAAA" })]);
    expect(r.rejected[0].code).toBe("ERR_BAD_CHUNK");
  });

  it("rejects a non-integer or negative version", () => {
    const r = parseChunkBatch([
      chunk({ version: -1 }),
      chunk({ cx: 1, version: 1.5 }),
    ]);
    expect(r.accepted).toEqual([]);
    expect(r.rejected).toHaveLength(2);
  });

  it("still accepts the good chunks of a batch that also has a bad one", () => {
    const r = parseChunkBatch([chunk({ cx: 1 }), chunk({ cx: 2, dim: "bad" })]);
    expect(r.accepted.map((c) => c.cx)).toEqual([1]);
    expect(r.rejected.map((c) => c.cx)).toEqual([2]);
  });

  it("refuses a batch above the size limit", () => {
    const many = Array.from({ length: MAX_CHUNKS_PER_BATCH + 1 }, (_, i) =>
      chunk({ cx: i }),
    );
    expect(() => parseChunkBatch(many)).toThrow(/batch/);
  });
});
