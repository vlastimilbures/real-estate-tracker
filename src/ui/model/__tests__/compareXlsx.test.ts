// ADR 0108 (#56): the Scenario compare exports to Excel: a Key figures sheet and one sheet
// per chart series, under the lens, holding the numbers the compare shows.
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  rate,
  realProjection,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { D } from "../../../lib/money";
import { fmtCzkM, fmtMultiple, fmtPct } from "../../../lib/format";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import {
  compareKpiRows,
  mergeCompareMetric,
  type CompareResult,
} from "../compare";
import { compareWorkbook } from "../compareXlsx";
import {
  buildWorkbook,
  cellValue,
  numFmt,
  type CellKind,
  type XlsxSheetCells,
} from "../xlsxExport";
import type { Mode } from "../lens";

function result(id: string, overrides = {}): CompareResult {
  const assn = applyScenario(assumptions, overrides);
  const projection = portfolioProjection(portfolio, assn);
  return {
    id,
    name: id,
    projection,
    realProjection: realProjection(projection, cpiIndex(assn)),
    kpis: portfolioKpis(portfolio, assn),
  };
}

const base = result("base");
const shocked = result("shock", {
  inflationShock: { deltaPa: rate("0.06"), durationYears: 3 },
});
const crash = result("crash", {
  valueShock: { pct: rate("0.2"), atYear: 0 },
});
const results = [base, shocked, crash];

const sheetOf = (sheets: XlsxSheetCells[], name: string) => {
  const s = sheets.find((x) => x.name === name);
  if (!s) throw new Error(`no sheet ${name}`);
  return s;
};
const keyFigures = (mode: Mode, rs = results) =>
  sheetOf(
    compareWorkbook(en, rs, mode).sheets,
    en.xlsx.sheetNames.compareKeyFigures,
  );

/** The written cell read back the way the compare table formats it. */
function asScreenText(kind: CellKind, v: ReturnType<typeof cellValue>) {
  if (v === null) return "—";
  if (typeof v === "string") return v;
  if (typeof v !== "number") throw new Error("unexpected cell");
  switch (kind) {
    case "money":
      return fmtCzkM(D(v));
    case "multiple":
      return fmtMultiple(D(v));
    case "percent":
      return fmtPct(D(v));
    default:
      return String(v);
  }
}

describe("compareWorkbook — shape", () => {
  it("names the file by lens and writes four sheets in the UI language", () => {
    const wb = compareWorkbook(cs, results, "real");
    expect(wb.filename).toBe("scenario-compare-real.xlsx");
    expect(wb.sheets.map((s) => s.name)).toEqual([
      cs.xlsx.sheetNames.compareKeyFigures,
      cs.xlsx.sheetNames.compareNetWorth,
      cs.xlsx.sheetNames.compareNetCashFlow,
      cs.xlsx.sheetNames.compareLtv,
    ]);
  });

  it("key figures: a Metric column, then one column per scenario", () => {
    const s = keyFigures("nominal");
    expect(s.headers).toEqual([en.xlsx.metric, "base", "shock", "crash"]);
    expect(s.rows.map((r) => r[0]?.value)).toEqual(
      compareKpiRows(en, "nominal", base).map((r) => r.label),
    );
  });

  it("chart sheets: a Year column, then one column per scenario", () => {
    const { sheets } = compareWorkbook(en, results, "nominal");
    for (const s of sheets.slice(1)) {
      expect(s.headers).toEqual([en.projGrid.year, "base", "shock", "crash"]);
      expect(s.rows[0]?.[0]).toEqual({
        kind: "int",
        value: base.projection[0]?.calendarYear,
      });
      expect(s.rows).toHaveLength(base.projection.length);
    }
  });
});

describe("compareWorkbook — the numbers match the compare (acceptance)", () => {
  for (const mode of ["nominal", "real"] as const) {
    it(`${mode}: every key-figure cell rounds to the table's text`, () => {
      const table = compareKpiRows(en, mode, base);
      const s = keyFigures(mode);
      expect(s.rows).toHaveLength(table.length);
      s.rows.forEach((cells, i) => {
        const row = table[i]!;
        results.forEach((r, j) => {
          const c = cells[j + 1]!;
          const shown = row.fmt(r).replace(/^\+/, "");
          expect(
            asScreenText(c.kind, cellValue(c.kind, c.value)),
            row.label,
          ).toBe(shown);
        });
      });
    });

    it(`${mode}: chart sheets hold the plotted rows, whole Kč and LTV fractions`, () => {
      const { sheets } = compareWorkbook(en, results, mode);
      const plotted = [
        mergeCompareMetric(results, mode, (y) => y.equity),
        mergeCompareMetric(results, mode, (y) => y.netCashFlow),
        mergeCompareMetric(results, mode, (y) => y.ltv),
      ];
      const kinds: CellKind[] = ["money", "money", "percent"];
      sheets.slice(1).forEach((s, k) => {
        s.rows.forEach((cells, t) => {
          results.forEach((_, j) => {
            const c = cells[j + 1]!;
            expect(c.kind).toBe(kinds[k]);
            expect(c.value).toBe(plotted[k]![t]![`s${j}`]);
          });
        });
      });
    });
  }

  it("the lens changes the numbers (real deflates by the scenario's CPI)", () => {
    const nw = (mode: Mode) =>
      sheetOf(
        compareWorkbook(en, results, mode).sheets,
        en.xlsx.sheetNames.compareNetWorth,
      ).rows.at(-1)?.[2]?.value;
    expect(nw("real")).not.toBe(nw("nominal"));
  });

  it("always writes values: no Δ-view cells, Base's Δ net worth is empty", () => {
    const s = keyFigures("nominal");
    const delta = s.rows.find(
      (r) => r[0]?.value === en.scenarios.kpiNetWorthDeltaVsBase,
    )!;
    expect(delta[1]?.value).toBeNull();
    const nominal = s.rows.find(
      (r) => r[0]?.value === en.scenarios.kpiNetWorthNominal,
    )!;
    expect(nominal[1]).toEqual({
      kind: "money",
      value: base.kpis.netWorthNominal,
    });
  });
});

describe("compareWorkbook — n/a cells and notes", () => {
  const flat: CompareResult = {
    ...shocked,
    name: "flat",
    kpis: {
      ...shocked.kpis,
      leveredIrrNominal: null,
      leveredIrrNominalReason: "NOT_UNIQUE",
    },
  };

  it("an IRR without a value is n/a text, and its reason is a note line", () => {
    const s = keyFigures("nominal", [base, flat]);
    const irr = s.rows.find(
      (r) => r[0]?.value === en.scenarios.kpiLeveredIrrNominal,
    )!;
    expect(irr[2]?.value).toBe(en.common.notApplicable);
    expect(s.notes).toContain(`flat: ${en.common.irrNotUnique}`);
  });

  it("notes: the lens first, then the rebased-returns footnote", () => {
    const s = keyFigures("real");
    expect(s.notes[0]).toBe(en.projections.realTerms);
    expect(s.notes).toContain(
      `* ${en.scenarios.rebasedReturnsFootnote("crash")}`,
    );
  });

  it("without Base: no Δ row and no footnote", () => {
    const s = keyFigures("nominal", [shocked, crash]);
    expect(s.rows.map((r) => r[0]?.value)).not.toContain(
      en.scenarios.kpiNetWorthDeltaVsBase,
    );
    expect(s.notes).toEqual([en.projections.nominalKc]);
  });

  it("each chart sheet notes the lens", () => {
    const { sheets } = compareWorkbook(en, results, "nominal");
    for (const s of sheets.slice(1))
      expect(s.notes).toEqual([en.projections.nominalKc]);
  });
});

describe("compareWorkbook — written workbook", () => {
  it("round-trips through Excel with the money and LTV formats", async () => {
    const wb = new ExcelJS.Workbook();
    const { sheets } = compareWorkbook(en, results, "nominal");
    await wb.xlsx.load((await buildWorkbook(sheets)).buffer as ArrayBuffer);
    expect(wb.worksheets).toHaveLength(4);
    const nw = wb.getWorksheet(en.xlsx.sheetNames.compareNetWorth)!;
    expect(nw.getRow(2).getCell(2).numFmt).toBe(numFmt("money"));
    expect(Number.isInteger(nw.getRow(2).getCell(2).value)).toBe(true);
    const ltv = wb.getWorksheet(en.xlsx.sheetNames.compareLtv)!;
    expect(ltv.getRow(2).getCell(2).numFmt).toBe(numFmt("percent"));
  });
});
