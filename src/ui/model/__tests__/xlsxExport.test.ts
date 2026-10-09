// The xlsx column map: each column's kind rounds and formats like the on-screen grid
// (D-10); LTV stays a fraction (Excel's % format multiplies by 100), opening-row flow
// cells are blanked like the on-screen "—", and a null DSCR is left empty.
import { describe, it, expect } from "vitest";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import {
  isoDate,
  money,
  portfolioProjection,
  propertySchedules,
} from "../../../engine";
import type { MortgageBlock } from "../../../engine";
import { devBlock } from "../../../engine/__tests__/support/mixed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { amortizationColumns } from "../propertyDetail";
import { projectionSeries, projectionColumns } from "../projection";
import { cellFmt, cellValue, numFmt } from "../xlsxExport";

const proj = portfolioProjection(portfolio, assumptions);
const rows = projectionSeries(proj, "nominal", assumptions);
const cols = projectionColumns(en, assumptions.baseDate, rows);
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

  it("text that Excel would read as a formula is written as typed (ADR 0145)", () => {
    for (const t of ["=SUM(A1)", "+1", "-1", "@x", "\tx", "\rx"]) {
      expect(cellValue("text", t)).toBe(t);
      expect(cellFmt("text", t)).toBe("@");
    }
    expect(cellValue("text", "Byt A")).toBe("Byt A");
    expect(cellFmt("text", "Byt A")).toBeUndefined();
  });
});

// ADR 0116 §12: owner-cash columns after DSCR, only when some year is non-zero.
describe("projection event columns", () => {
  const withEvents = {
    ...portfolio,
    mortgages: portfolio.mortgages.map((m) =>
      m.propertyId === "javorova"
        ? {
            ...m,
            prepayments: [
              {
                date: isoDate("2031-01-17"),
                amount: money(500000),
                effect: "shortenTerm" as const,
                fee: money(2000),
              },
            ],
          }
        : m,
    ),
  };
  const series = projectionSeries(
    portfolioProjection(withEvents, assumptions),
    "nominal",
    assumptions,
  );
  const g = en.projGrid;

  it("are absent without events", () => {
    expect(cols.map((c) => c.header)).not.toContain(g.prepaid);
    expect(cols.map((c) => c.header).at(-1)).toBe(g.dscr);
  });

  it("show Prepaid and Prepayment fees with the year's totals, blank in the opening row", () => {
    const c = projectionColumns(en, assumptions.baseDate, series);
    expect(c.map((x) => x.header).slice(-3)).toEqual([
      g.dscr,
      g.prepaid,
      g.prepaymentFees,
    ]);
    const year = series.find((r) => !r.prepaid.isZero())!;
    expect(c.at(-2)!.value(year)).toEqual(money(500000));
    expect(c.at(-1)!.value(year)).toEqual(money(2000));
    expect(c.at(-1)!.value(series[0]!)).toBeNull();
  });
});

// UX-062 (DR-091): export headers follow the UI language, like the on-screen tables.
describe("translated export headers", () => {
  it("projection headers are the grid's labels in the user's language", () => {
    const headers = projectionColumns(cs, isoDate("2026-06-07"), rows).map(
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
      cs.projGrid.cashToOwner,
      cs.projGrid.dscr,
    ]);
  });

  it("the Period cell uses the language's month names", () => {
    const period = projectionColumns(cs, isoDate("2026-06-07"), rows)[1]!;
    expect(period.value(rows[1]!)).toBe(
      `${cs.monthsShort[6]} 2026 – ${cs.monthsShort[5]} 2027`,
    );
    expect(period.value(rows[0]!)).toBe(cs.projGrid.opening);
  });

  it("amortization headers are the table's labels", () => {
    const d = ru.propertyDetail;
    expect(amortizationColumns(ru, []).map((c) => c.header)).toEqual([
      d.amColMonth,
      d.amColDate,
      d.amColRate,
      d.amColInstalment,
      d.amColInterest,
      d.amColPrincipal,
      d.amColEndBalance,
    ]);
  });

  const rowsOf = (b: MortgageBlock) =>
    propertySchedules([b], [b.propertyId], assumptions).get(b.propertyId)!.rows;

  it("adds Prepaid and Prepayment fee only when a row has them (ADR 0116 §12)", () => {
    const d = en.propertyDetail;
    const seed = portfolio.mortgages.find((m) => m.propertyId === "javorova")!;
    const prepaid = rowsOf({
      ...seed,
      prepayments: [
        {
          date: isoDate("2031-01-17"),
          amount: money(500000),
          effect: "lowerInstalment",
          fee: money(1000),
        },
      ],
    });
    const cols = amortizationColumns(en, prepaid);
    expect(cols.map((c) => c.header).slice(-3)).toEqual([
      d.amColPrepaid,
      d.amColPrepaymentFee,
      d.amColEndBalance,
    ]);
    const row = prepaid.find((r) => !r.prepaid.isZero())!;
    const value = (h: string) => cols.find((c) => c.header === h)!.value(row);
    expect(value(d.amColPrepaid)).toEqual(money(500000));
    expect(value(d.amColPrepaymentFee)).toEqual(money(1000));
    expect(amortizationColumns(en, rowsOf(seed))).toHaveLength(7);
  });

  it("the date column is the payment due date, empty with none (ADR 0164)", () => {
    const seed = portfolio.mortgages.find((m) => m.propertyId === "javorova")!;
    const due = amortizationColumns(en, [])[1]!;
    expect(due.header).toBe("Due date");
    expect(due.kind).toBe("date");
    const row56 = rowsOf(seed)[55]!;
    expect(due.value(row56)).toEqual(isoDate("2031-01-17"));
    expect(due.value({ ...row56, dueDate: null })).toBeNull();
  });

  it("adds Drawn for a development loan's tranches", () => {
    const headers = amortizationColumns(en, rowsOf(devBlock)).map(
      (c) => c.header,
    );
    expect(headers).toContain(en.propertyDetail.amColDrawn);
    expect(headers).not.toContain(en.propertyDetail.amColPrepaid);
  });
});
