import { describe, expect, it } from "vitest";
import { canonicalize } from "./jcs";

describe("canonicalize (JCS)", () => {
  it("sorts keys, no whitespace, nested", () => {
    expect(canonicalize({ b: 1, a: { d: null, c: [true, "x"] } })).toBe(
      '{"a":{"c":[true,"x"],"d":null},"b":1}',
    );
  });
  it("is independent of key insertion order", () => {
    expect(canonicalize({ x: 1, y: 2 })).toBe(canonicalize({ y: 2, x: 1 }));
  });
  it("escapes strings like JSON and rejects floats", () => {
    const tricky = {
      s: "a" + String.fromCharCode(34) + "b" + String.fromCharCode(10),
    };
    expect(canonicalize(tricky)).toBe(JSON.stringify(tricky));
    expect(() => canonicalize({ n: 1.5 })).toThrow();
  });
  it("skips undefined values", () => {
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});
