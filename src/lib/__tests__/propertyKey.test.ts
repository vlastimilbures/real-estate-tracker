// ADR 0237 (#455): property names are compared in one Unicode form (NFC). The NFD
// strings are written as escapes so no editor or formatter can normalise the source.
import { describe, it, expect } from "vitest";
import { propertyKey } from "../propertyKey";

const NFC = "N\u00e1rodn\u00ed 12";
const NFD = "Na\u0301rodni\u0301 12";

describe("propertyKey", () => {
  it("gives a decomposed (NFD) name the key of its composed (NFC) spelling", () => {
    expect(NFD).not.toBe(NFC);
    expect(propertyKey(NFD)).toBe(propertyKey(NFC));
  });

  it("matches an upper-case, padded NFC spelling to the NFD one", () => {
    expect(propertyKey("  N\u00c1RODN\u00cd 12 ")).toBe(propertyKey(NFD));
  });
});
