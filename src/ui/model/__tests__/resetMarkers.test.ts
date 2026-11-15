// ADR 0210 (#382): upcoming fixation ends marked on the 30-year value chart, one marker
// per projection year, listing property, date and debt at reset.
import { describe, it, expect } from "vitest";
import {
  addYears,
  isoDate,
  money,
  portfolioOutputs,
  type FixationReset,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { fmtDate } from "../../../lib/format";
import { projectionSeries } from "../projection";
import { toChartRows } from "../chartData";
import { resetMarkers } from "../financing";

function run(p: Portfolio, asOf = assumptions.baseDate) {
  const out = portfolioOutputs(p, assumptions, asOf);
  const rows = toChartRows(
    projectionSeries(out.projection, "nominal", assumptions),
  );
  return { out, rows };
}
const names = (p: Portfolio) =>
  new Map(p.properties.map((x) => [x.id, x.name] as const));

describe("resetMarkers (ADR 0210 §1)", () => {
  it("sample at today: 2029 (Lipova) and 2031 (Javorova, Dubova), earliest first", () => {
    const { out, rows } = run(portfolio);
    const m = resetMarkers(out.financing.resets, rows, names(portfolio));
    expect(m.map((x) => x.calendarYear)).toEqual([2029, 2031]);
    expect(m[0]!.resets.map((r) => [r.name, r.date])).toEqual([
      ["Byt Lipova", "15.01.2029"],
    ]);
    expect(m[1]!.resets.map((r) => [r.name, r.date])).toEqual([
      ["Byt Javorova", "17.01.2031"],
      ["Byt Dubova", "12.03.2031"],
    ]);
    const lipova = out.financing.resets.find(
      (r) => r.status === "upcoming" && fmtDate(r.fixationEnd) === "15.01.2029",
    )!;
    expect(m[0]!.resets[0]!.balance.equals(lipova.balance)).toBe(true);
  });

  it("marks only upcoming resets: at +3 years Lipova's has passed", () => {
    const asOf = addYears(assumptions.baseDate, 3);
    const { out, rows } = run(portfolio, asOf);
    const m = resetMarkers(out.financing.resets, rows, names(portfolio));
    expect(m.map((x) => [x.calendarYear, x.resets.map((r) => r.name)])).toEqual(
      [[2031, ["Byt Javorova", "Byt Dubova"]]],
    );
  });

  it("at +5 years every sample reset has passed: no marker", () => {
    const asOf = addYears(assumptions.baseDate, 5);
    const { out, rows } = run(portfolio, asOf);
    expect(resetMarkers(out.financing.resets, rows, names(portfolio))).toEqual(
      [],
    );
  });

  it("none when no reset is ahead", () => {
    const { rows } = run(portfolio);
    expect(resetMarkers([], rows, new Map())).toEqual([]);
  });

  it("a reset past the last projection year is not marked", () => {
    const { out, rows } = run(portfolio);
    const short = rows.filter((r) => r.calendarYear < 2030);
    expect(
      resetMarkers(out.financing.resets, short, names(portfolio)).map(
        (x) => x.calendarYear,
      ),
    ).toEqual([2029]);
  });

  // The year whose months hold the fixation-end payment, as the table's Period column:
  // year t holds grid months (t−1)·12+1 … t·12; never the opening point.
  const rowsByYear = [0, 1, 2, 3, 4].map((year) => ({
    year,
    calendarYear: 2026 + year,
  }));
  const reset = (
    blockId: string,
    propertyId: string,
    gridMonth: number,
    date: string,
  ): FixationReset => ({
    propertyId,
    blockId,
    fixationEnd: isoDate(date),
    gridMonth,
    status: "upcoming",
    balance: money("1000"),
  });

  it.each([
    [1, 2027],
    [3, 2027],
    [12, 2027],
    [13, 2028],
    [38, 2030],
  ])("grid month %i is in the year shown as %i", (gridMonth, calendarYear) => {
    expect(
      resetMarkers(
        [reset("b", "p", gridMonth, "2027-01-01")],
        rowsByYear,
        new Map([["p", "Byt Lipova"]]),
      ).map((x) => x.calendarYear),
    ).toEqual([calendarYear]);
  });

  it("two resets on one date: property order, each with its block id", () => {
    const m = resetMarkers(
      [
        reset("b2", "p2", 20, "2028-02-01"),
        reset("b1", "p1", 20, "2028-02-01"),
        reset("b3", "p1", 20, "2028-02-01"),
      ],
      rowsByYear,
      new Map([
        ["p1", "Byt Dubova"],
        ["p2", "Byt Javorova"],
      ]),
    );
    expect(m[0]!.resets.map((r) => [r.id, r.name])).toEqual([
      ["b1", "Byt Dubova"],
      ["b3", "Byt Dubova"],
      ["b2", "Byt Javorova"],
    ]);
  });
});
