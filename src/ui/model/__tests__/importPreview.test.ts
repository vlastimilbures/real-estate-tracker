import { describe, it, expect } from "vitest";
import {
  changeText,
  groupByFile,
  importCounts,
  itemLabel,
} from "../importPreview";
import { getDict } from "../../../i18n";
import { fmtCzk, fmtPct } from "../../../lib/format";
import type { ImportItem } from "../../../import/csvImport";

const item = (over: Partial<ImportItem>): ImportItem => ({
  file: "properties",
  row: 2,
  kind: "add",
  propertyId: "byt-a",
  propertyName: "Byt A",
  date: null,
  changes: [],
  ...over,
});

describe("groupByFile (ADR 0096)", () => {
  it("groups per file in panel order under the translated title (UX-034)", () => {
    const cs = getDict("cs");
    const groups = groupByFile(cs, [
      item({ file: "rents", date: "2025-01-01" }),
      item({ row: 3, kind: "update" }),
      item({ row: 4, kind: "unchanged" }),
      item({ file: "valuations", date: "2026-01-01" }),
    ]);
    expect(
      groups.map((g) => [
        g.title,
        g.added.length,
        g.updated.length,
        g.unchanged,
      ]),
    ).toEqual([
      [cs.importPage.propertiesTitle, 0, 1, 1],
      [cs.importPage.valuationsTitle, 1, 0, 0],
      [cs.importPage.rentsTitle, 1, 0, 0],
    ]);
  });
});

describe("importCounts", () => {
  it("counts adds and updates, not unchanged rows", () => {
    expect(
      importCounts([
        item({}),
        item({ kind: "update" }),
        item({ kind: "unchanged" }),
      ]),
    ).toEqual({ added: 1, updated: 1 });
  });
});

describe("itemLabel", () => {
  it("names a property, and a child row by property and display date", () => {
    expect(itemLabel(item({}))).toBe("Byt A");
    expect(itemLabel(item({ date: "2026-06-01" }))).toBe("Byt A · 01.06.2026");
  });
});

describe("changeText", () => {
  it("formats money, rates, dates, flags and empty values for display", () => {
    expect(
      changeText({
        field: "purchase_price",
        before: "5000000",
        after: "5100000",
      }),
    ).toBe(`${fmtCzk("5000000")} → ${fmtCzk("5100000")}`);
    expect(
      changeText({
        field: "interest_rate_pa",
        before: "0.0169",
        after: "0.0199",
      }),
    ).toBe(`${fmtPct("0.0169", 2)} → ${fmtPct("0.0199", 2)}`);
    expect(
      changeText({ field: "end_date", before: null, after: "2026-08-31" }),
    ).toBe("— → 31.08.2026");
    expect(changeText({ field: "garage", before: "0", after: "1" })).toBe(
      "false → true",
    );
    expect(changeText({ field: "address", before: "A", after: null })).toBe(
      "A → —",
    );
  });
});
