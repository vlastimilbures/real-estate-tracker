// ADR 0088 (#13): Dashboard / Property detail labels name what the tiles show: today, the
// records in force on a date, or the projection year the as-of date rounds to.
import { describe, it, expect } from "vitest";
import {
  asOfView,
  asOfHint,
  horizonEndYear,
  monthlyFlowLabels,
  netCashFlowFoot,
  ownedOn,
  projectionYearForAsOf,
} from "../dashboard";
import { periodLabelLocalized, yearLabel, type SeriesRow } from "../projection";
import { D, ZERO } from "../../../lib/money";
import { addYears, edate, isoDate } from "../../../engine";
import { en } from "../../../i18n/en";

const baseDate = isoDate("2026-06-07");

function row(year: number): SeriesRow {
  return {
    year,
    calendarYear: 2026 + year,
    value: ZERO,
    balance: ZERO,
    equity: ZERO,
    ltv: ZERO,
    grossRent: ZERO,
    effectiveRent: ZERO,
    holdingCosts: ZERO,
    noi: ZERO,
    interest: ZERO,
    principal: ZERO,
    debtService: ZERO,
    netCashFlow: D("1"),
    dscr: null,
    draws: ZERO,
    refinanced: ZERO,
    prepaid: ZERO,
    prepaymentFees: ZERO,
  };
}

// Years 0…30, like a 30-year horizon.
const series = Array.from({ length: 31 }, (_, y) => row(y));
const plus5 = addYears(baseDate, 5);

describe("asOfView (ADR 0088)", () => {
  it("today at the base date is today", () => {
    expect(asOfView(baseDate, baseDate, series, true)).toEqual({
      kind: "today",
    });
  });

  it("+5y is projection year 5, the row tilesForAsOf reads", () => {
    const b = asOfView(baseDate, plus5, series, false);
    expect(b).toEqual({ kind: "projection", year: 5, calendarYear: 2031 });
    expect(projectionYearForAsOf(baseDate, plus5)).toBe(5);
  });

  it("today is a projection year once the base date is ≥ 6 months back", () => {
    const today = edate(baseDate, 24);
    expect(asOfView(baseDate, today, series, true)).toEqual({
      kind: "projection",
      year: 2,
      calendarYear: 2028,
    });
  });

  it("a month-end base date counts D-21 grid months, as value growth and CPI do (#113)", () => {
    // 31 Aug → 28 Feb is six grid months (the clamped month end counts): year 1, as with a
    // mid-month base date. Calendar months said five, so year 0.
    const monthEnd = isoDate("2026-08-31");
    expect(
      asOfView(monthEnd, isoDate("2027-02-28"), series, false),
    ).toMatchObject({ kind: "projection", year: 1 });
    expect(
      asOfView(monthEnd, isoDate("2028-02-29"), series, false),
    ).toMatchObject({ kind: "projection", year: 2 });
  });

  it("a non-today date under six months out shows the records in force", () => {
    const d = edate(baseDate, 3);
    expect(asOfView(baseDate, d, series, false)).toEqual({
      kind: "snapshot",
      date: d,
      beyondHorizon: false,
    });
  });

  it("a date that rounds past the last year is beyond the horizon", () => {
    const d = addYears(baseDate, 40);
    expect(asOfView(baseDate, d, series, false)).toEqual({
      kind: "snapshot",
      date: d,
      beyondHorizon: true,
    });
  });
});

describe("as-of labels (ADR 0088)", () => {
  const period5 = periodLabelLocalized(
    baseDate,
    5,
    en.monthsShort,
    en.projGrid.opening,
  );
  const y5 = yearLabel(en, 5, 2031);

  it("projection year: monthly equivalent with the Projections row label and period", () => {
    const b = asOfView(baseDate, plus5, series, false);
    const { title, hint } = monthlyFlowLabels(en, b, baseDate, plus5);
    expect(y5).toBe("Y5 · 2031");
    expect(period5).toBe("Jul 2030 – Jun 2031");
    expect(title).toBe(
      "Monthly equivalent — projection year Y5 · 2031 (Jul 2030 – Jun 2031)",
    );
    expect(hint).toBe("annual projection ÷ 12");
    expect(netCashFlowFoot(en, b)).toBe(
      "NOI − debt service, projection year Y5 · 2031",
    );
    expect(asOfHint(en, b, baseDate)).toBe(
      "Future dates show the nearest projection year (Y5 · 2031, Jul 2030 – Jun 2031)",
    );
    for (const s of [title, hint, netCashFlowFoot(en, b)])
      expect(s).not.toMatch(/today|current/i);
  });

  it("today: current wording, run-rate hint with the date, no picker hint", () => {
    const b = asOfView(baseDate, baseDate, series, true);
    expect(monthlyFlowLabels(en, b, baseDate, baseDate)).toEqual({
      title: "Current monthly cash flow",
      hint: "annualised run rate ÷ 12, leases in force on 07.06.2026",
    });
    expect(netCashFlowFoot(en, b)).toBe("NOI − debt service, current");
    expect(asOfHint(en, b, baseDate)).toBeNull();
  });

  it("records in force on a date: dated wording, never today/current", () => {
    const d = edate(baseDate, 3);
    const b = asOfView(baseDate, d, series, false);
    const { title, hint } = monthlyFlowLabels(en, b, baseDate, d);
    expect(title).toBe("Monthly cash flow on 07.09.2026");
    expect(hint).toBe(
      "annualised run rate ÷ 12, leases in force on 07.09.2026",
    );
    expect(netCashFlowFoot(en, b)).toBe("NOI − debt service, on 07.09.2026");
    expect(asOfHint(en, b, baseDate)).toBe(
      "Showing records in force on 07.09.2026",
    );
  });

  it("beyond the horizon: says it is not a projection", () => {
    const d = addYears(baseDate, 40);
    const b = asOfView(baseDate, d, series, false);
    expect(asOfHint(en, b, baseDate)).toBe(
      "Beyond the horizon — showing records in force on 07.06.2066, not a projection",
    );
  });

  it("horizon end year is the last projection row, whatever the as-of", () => {
    expect(horizonEndYear(series)).toBe(2056);
    expect(en.dashboard.netWorthInYear(2056, 30)).toBe(
      "Net worth in 2056 (30-yr horizon)",
    );
  });
});

describe("ownedOn (ADR 0150)", () => {
  const y2 = { kind: "projection", year: 2, calendarYear: 2028 } as const;
  const asOf = isoDate("2028-01-01");

  it("in a projection year: owned once bought by that year's end", () => {
    expect(ownedOn(isoDate("2028-03-15"), y2, baseDate, asOf)).toBe(true);
    expect(ownedOn(isoDate("2028-06-07"), y2, baseDate, asOf)).toBe(true);
    expect(ownedOn(isoDate("2028-06-08"), y2, baseDate, asOf)).toBe(false);
  });

  it("today or on a date: owned once bought by the as-of date", () => {
    const on = { kind: "snapshot", date: asOf, beyondHorizon: false } as const;
    expect(ownedOn(isoDate("2028-03-15"), on, baseDate, asOf)).toBe(false);
    expect(ownedOn(isoDate("2028-01-01"), on, baseDate, asOf)).toBe(true);
  });
});
