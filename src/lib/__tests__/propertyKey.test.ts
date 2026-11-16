// ADR 0237 (#455): property names are compared in one Unicode form (NFC). The NFD
// strings are written as escapes so no editor or formatter can normalise the source.
import { describe, it, expect } from "vitest";
import { propertyKey } from "../propertyKey";

const NFC = "Národní 12";
const NFD = "Národní 12";

describe("propertyKey", () => {
  it("gives a decomposed (NFD) name the key of its composed (NFC) spelling", () => {
    expect(NFD).not.toBe(NFC);
    expect(propertyKey(NFD)).toBe(propertyKey(NFC));
  });

  it("still matches trimmed and case-insensitively (D-55)", () => {
    expect(propertyKey("  NÁRODNÍ 12 ")).toBe(propertyKey(NFD));
  });
});
