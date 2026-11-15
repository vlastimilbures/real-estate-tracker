// ADR 0210 (#382): upcoming fixation ends marked on the 30-year value chart, one marker
// per projection year, listing property, date and debt at reset.
import { describe, it, expect } from "vitest";
import { addYears, portfolioOutputs, type Portfolio } from "../../../engine";
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
    const m = resetMarkers(
      out.financing.resets,
      rows,
      assumptions.baseDate,
      names(portfolio),
    );
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

  it("marks only upcoming resets: at +5 years Lipova's has passed", () => {
    const asOf = addYears(assumptions.baseDate, 5);
    const { out, rows } = run(portfolio, asOf);
    const m = resetMarkers(
      out.financing.resets,
      rows,
      assumptions.baseDate,
      names(portfolio),
    );
    expect(m.flatMap((x) => x.resets.map((r) => r.name))).not.toContain(
      "Byt Lipova",
    );
  });

  it("none when no reset is ahead", () => {
    const { rows } = run(portfolio);
    expect(resetMarkers([], rows, assumptions.baseDate, new Map())).toEqual([]);
  });

  it("a reset past the last projection year is not marked", () => {
    const { out, rows } = run(portfolio);
    const short = rows.filter((r) => r.calendarYear < 2030);
    expect(
      resetMarkers(
        out.financing.resets,
        short,
        assumptions.baseDate,
        names(portfolio),
      ).map((x) => x.calendarYear),
    ).toEqual([2029]);
  });
});
