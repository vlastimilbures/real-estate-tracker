// Every formatter and number conversion on the edge cases, pinned whole: a negative zero,
// values that round to zero, half-way rounding, huge and tiny values. Written before the
// formatters share one sign helper and one Decimal-to-number route, so the output cannot
// change.
import { describe, expect, it } from "vitest";
import { D } from "../money";
import {
  cellMoney,
  cellMultiple,
  cellPct,
  fmtCzk,
  fmtCzkAxisTick,
  fmtCzkAxisValue,
  fmtCzkM,
  fmtDscr,
  fmtMultiple,
  fmtNumber,
  fmtPct,
  fmtPp,
  fmtSigned,
  pickCzkAxisUnit,
  toNumber,
} from "../format";
import { cellValue, type CellKind } from "../../ui/model/xlsxExport";

const VALUES = [
  "0",
  "-0",
  "0.0004",
  "-0.0004",
  "0.5",
  "-0.5",
  "1.5",
  "-1.5",
  "2.5",
  "0.04999",
  "0.05",
  "-0.05",
  "999.95",
  "-999.95",
  "1234567.891",
  "-1234567.891",
  "28730000",
  "-28730000",
  "99.995",
  "100.005",
  "123456789012345678.5",
  "-123456789012345678.5",
  "1e21",
  "-1e21",
  "1e-12",
  "0.3312",
  "0.33125",
];

describe("the formatters on edge values", () => {
  it("each value through every formatter", () => {
    const rows = VALUES.map((v) => ({
      v,
      czk: fmtCzk(v),
      czkParens: fmtCzk(v, { parens: true }),
      czkBare: fmtCzk(v, { suffix: false }),
      czk2: fmtCzk(v, { decimals: 2 }),
      czk2Parens: fmtCzk(v, { decimals: 2, parens: true }),
      number: fmtNumber(v),
      czkM: fmtCzkM(v),
      czkM2: fmtCzkM(v, 2),
      pct: fmtPct(v),
      pct2: fmtPct(v, 2),
      pp: fmtPp(v),
      multiple: fmtMultiple(v),
      dscr: fmtDscr(v),
      signedCzk: fmtSigned(v, (d) => fmtCzk(d)),
      signedPct: fmtSigned(v, (d) => fmtPct(d)),
    }));
    expect(rows).toMatchSnapshot();
  });

  it("the axis units and their ticks", () => {
    const ranges = [
      [],
      [0],
      [999],
      [1_000],
      [9_999],
      [10_000],
      [999_999],
      [1_000_000],
      [9_999_999],
      [10_000_000],
      [-25_000_000, 3],
      [Number.NaN, 5_000],
      [Number.POSITIVE_INFINITY],
    ];
    const out = ranges.map((values) => {
      const unit = pickCzkAxisUnit(values);
      const local = pickCzkAxisUnit(values, "тыс.");
      return {
        values: values.map(String),
        unit,
        local,
        ticks: VALUES.map((v) => [
          fmtCzkAxisValue(v, unit),
          fmtCzkAxisTick(v, unit),
        ]),
      };
    });
    expect(out).toMatchSnapshot();
  });
});

describe("the number conversions on edge values", () => {
  it("toNumber and the spreadsheet cells", () => {
    const rows = VALUES.map((v) => ({
      v,
      toNumber: String(toNumber(v)),
      money: String(cellMoney(v)),
      pct: String(cellPct(v)),
      pct2: String(cellPct(v, 2)),
      multiple: String(cellMultiple(v)),
      multiple1: String(cellMultiple(v, 1)),
    }));
    expect(rows).toMatchSnapshot();
  });

  it("an exported cell of every kind, from a Decimal and from a number", () => {
    const kinds: CellKind[] = [
      "money",
      "percent",
      "rate",
      "multiple",
      "int",
      "date",
      "text",
    ];
    const rows = VALUES.map((v) => ({
      v,
      cells: kinds.map((k) => [
        k,
        String(cellValue(k, D(v))),
        String(cellValue(k, Number(v))),
      ]),
    }));
    expect(rows).toMatchSnapshot();
  });
});
