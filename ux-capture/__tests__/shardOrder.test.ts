// The interleaved order capture.spec.ts declares the screens in (shardOrder.ts): each
// screen once, every third one per pass. ux-shards.test.mjs proves the CI shards.
import { describe, expect, it } from "vitest";
import { interleave } from "../shardOrder.ts";

describe("interleave", () => {
  it("takes every third item from offset 0, then 1, then 2", () => {
    expect(interleave([0, 1, 2, 3, 4, 5, 6, 7])).toEqual([
      0, 3, 6, 1, 4, 7, 2, 5,
    ]);
  });

  it("keeps each item exactly once, for any length", () => {
    for (let n = 0; n <= 40; n++) {
      const items = Array.from({ length: n }, (_, i) => i);
      const out = interleave(items);
      expect(out).toHaveLength(n);
      expect([...out].sort((a, b) => a - b)).toEqual(items);
    }
  });

  it("returns the list as is with a stride of 1", () => {
    expect(interleave(["a", "b", "c"], 1)).toEqual(["a", "b", "c"]);
  });
});
