// The xlsx column map: each column's kind rounds and formats like the on-screen grid
// (D-10); LTV stays a fraction (Excel's % format multiplies by 100), opening-row flow
// cells are blanked like the on-screen "—", and a null DSCR is left empty.
import { describe, it, expect } from "vitest";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { isoDate, portfolioProjection } from "../../../engine";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { amortizationColumns } from "../propertyDetail";
import { projectionSeries, projectionColumns } from "../projection";
import { cellValue, numFmt, safeText } from "../xlsxExport";

const proj = portfolioProjection(portfolio, assumptions);
const rows = projectionSeries(proj, "nominal", assumptions);
const cols = projectionColumns(en, assumptions.baseDate);
const col = (h: string) => cols.find((c) => c.header === h)!;
const cell = (h: string, row = rows[0]) =>
  cellValue(col(h).kind, col(h).value(row));

describe("projectionColumns", () => {
  it("LTV is a fraction rounded as shown (33,1 %) with a percent format", () => {
    expect(col("LTV").kind).toBe("percent");
    expect(numFmt("percent")).toBe("0.0%");
    expect(cell("LTV")).toBe(0.331);
  });

  it("blanks the opening row's flow cells", () => {
    const opening = rows[0];
    expect(opening.year).toBeLessThanOrEqual(0);
    for (const h of ["Gross rent", "NOI", "Net CF", "Debt svc"]) {
      expect(cell(h, opening)).toBeNull();
    }
    expect(cell("Value", opening)).not.toBeNull();
  });

  it("money cells hold the whole units the grid shows (D-10, DR-028)", () => {
    expect(col("Debt").kind).toBe("money");
    expect(cell("Debt")).toBe(9_515_405);
    expect(cell("Value")).toBe(28_730_000);
    for (const r of rows.slice(1))
      for (const h of ["Debt", "NOI", "Interest", "Principal", "Net CF"])
        expect(Number.isInteger(cell(h, r)), `${h} ${r.year}`).toBe(true);
  });

  it("DSCR has two decimals, or stays empty with no debt service", () => {
    expect(numFmt("multiple")).toBe('0.00"x"');
    for (const r of rows) {
      const v = cell("DSCR", r);
      if (r.dscr === null) expect(v).toBeNull();
      else expect(v).toBe(Number(r.dscr.toFixed(2)));
    }
  });
});

describe("cell kinds", () => {
  it("an interest rate keeps two decimals of a percent, like the amortization table", () => {
    expect(numFmt("rate")).toBe("0.00%");
    expect(cellValue("rate", 0.0169)).toBe(0.0169);
    expect(cellValue("rate", 0.016949)).toBe(0.0169);
  });

  it("rounds half away from zero, like fmtCzk", () => {
    expect(cellValue("money", 2.5)).toBe(3);
    expect(cellValue("money", -2.5)).toBe(-3);
  });

  it("text that Excel would read as a formula stays literal (DR-087)", () => {
    for (const t of ["=SUM(A1)", "+1", "-1", "@x", "\tx", "\rx"])
      expect(safeText(t)).toBe(`'${t}`);
    expect(safeText("Byt A")).toBe("Byt A");
    expect(cellValue("text", "=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
});

// UX-062 (DR-091): export headers follow the UI language, like the on-screen tables.
describe("translated export headers", () => {
  it("projection headers are the grid's labels in the user's language", () => {
    const headers = projectionColumns(cs, isoDate("2026-06-07")).map(
      (c) => c.header,
    );
    expect(headers).toEqual([
      cs.projGrid.year,
      cs.projGrid.period,
      cs.projGrid.value,
      cs.projGrid.debt,
      cs.projGrid.equity,
      cs.projGrid.ltv,
      cs.projGrid.grossRent,
      cs.projGrid.effective,
      cs.projGrid.holding,
      cs.projGrid.noi,
      cs.projGrid.interest,
      cs.projGrid.principal,
      cs.projGrid.debtSvc,
      cs.projGrid.netCf,
      cs.projGrid.dscr,
    ]);
  });

  it("the Period cell uses the language's month names", () => {
    const period = projectionColumns(cs, isoDate("2026-06-07"))[1]!;
    expect(period.value(rows[1]!)).toBe(
      `${cs.monthsShort[6]} 2026 – ${cs.monthsShort[5]} 2027`,
    );
    expect(period.value(rows[0]!)).toBe(cs.projGrid.opening);
  });

  it("amortization headers are the table's labels", () => {
    const d = ru.propertyDetail;
    expect(amortizationColumns(ru).map((c) => c.header)).toEqual([
      d.amColMonth,
      d.amColDate,
      d.amColRate,
      d.amColInstalment,
      d.amColInterest,
      d.amColPrincipal,
      d.amColEndBalance,
    ]);
  });
});
