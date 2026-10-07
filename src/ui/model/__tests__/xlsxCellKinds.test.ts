// The remaining cell kinds keep their value and format (D-10).
import { describe, it, expect } from "vitest";
import { D } from "../../../lib/money";
import { cellFmt, cellValue, numFmt, type CellKind } from "../xlsxExport";

describe("other cell kinds", () => {
  it("dates stay dates with dd.mm.yyyy", () => {
    const d = new Date(Date.UTC(2031, 0, 17));
    expect(cellValue("date", d)).toBe(d);
    expect(numFmt("date")).toBe("dd.mm.yyyy");
  });

  it("integers pass through, from a number or a Decimal, with no format", () => {
    expect(cellValue("int", 56)).toBe(56);
    expect(cellValue("int", D(2026))).toBe(2026);
    expect(numFmt("int")).toBeUndefined();
    expect(numFmt("text")).toBeUndefined();
  });

  it("a string in a number column is written as typed (ADR 0145)", () => {
    expect(cellValue("money", "n/a")).toBe("n/a");
    expect(cellValue("money", "=1")).toBe("=1");
    expect(cellFmt("money", "=1")).toBe("@");
    expect(cellFmt("money", "n/a")).toBe(numFmt("money"));
  });
});

describe("non-finite numbers (ADR 0145)", () => {
  const kinds: CellKind[] = ["money", "percent", "rate", "multiple", "int"];

  for (const kind of kinds)
    it(`${kind}: NaN and ±Infinity, as a number or a Decimal, are an empty cell`, () => {
      for (const v of [NaN, Infinity, -Infinity]) {
        expect(cellValue(kind, v), `${v}`).toBeNull();
        expect(cellValue(kind, D(v)), `D(${v})`).toBeNull();
      }
    });
});
