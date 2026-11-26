// ADR 0088 (#13): Dashboard / Property detail labels name what the tiles show: today, the
// records in force on a date, or the projection year the as-of date rounds to.
import { describe, it, expect } from "vitest";
import {
  asOfView,
  asOfHint,
  horizonEndYear,
  basisText,
  ownedOn,
  projectionYearForAsOf,
} from "../dashboard";
import { periodLabelLocalized, yearLabel, type SeriesRow } from "../projection";
import { D, ZERO } from "../../../lib/money";
import {
  addYears,
  edate,
  isoDate,
  portfolioProjection,
  propertyProjections,
} from "../../../engine";
import {
  assumptions as seedAssumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { en } from "../../../i18n/en";

const baseDate = isoDate("2026-06-07");

function row(year: number): SeriesRow {
  return {
    year,
    calendarYear: 2026 + year,
    value: ZERO,
    balance: ZERO,
    committedDebt: ZERO,
    undrawnDebt: ZERO,
    reportedValue: ZERO,
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
    cashToOwner: D("1"),
    dscr: null,
    draws: ZERO,
    committedDraws: ZERO,
    acquiredValue: ZERO,
    refinanced: ZERO,
    prepaid: ZERO,
    prepaymentFees: ZERO,
  };
}

// Years 0…30, like a 30-year horizon.
const series = Array.from({ length: 31 }, (_, y) => row(y));
const plus5 = addYears(baseDate, 5);

describe("asOfView (ADR 0088)", () => {
  // #265: the basis takes a projection year's calendar year from the base date alone,
  // as every engine projection row numbers it (seed, and future, development and
  // inactive properties).
  it("a projection row's calendar year is the base year plus its year", () => {
    const rows = [portfolio, mixed]
      .flatMap((p) => [
        portfolioProjection(p, seedAssumptions),
        ...propertyProjections(p, seedAssumptions).values(),
      ])
      .flat();
    const baseYear = seedAssumptions.baseDate.getUTCFullYear();
    for (const r of rows) expect(r.calendarYear).toBe(baseYear + r.year);
  });

  it("today at the base date is today", () => {
    expect(asOfView({ baseDate, asOf: baseDate }, true)).toEqual({
      kind: "today",
    });
  });

  it("+5y is projection year 5, the row tilesForAsOf reads", () => {
    const b = asOfView({ baseDate, asOf: plus5 }, false);
    expect(b).toEqual({ kind: "projection", year: 5, calendarYear: 2031 });
    expect(projectionYearForAsOf({ baseDate, asOf: plus5 })).toBe(5);
  });

  it("today is a projection year once the base date is ≥ 6 months back", () => {
    const today = edate(baseDate, 24);
    expect(asOfView({ baseDate, asOf: today }, true)).toEqual({
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
      asOfView({ baseDate: monthEnd, asOf: isoDate("2027-02-28") }, false),
    ).toMatchObject({
      kind: "projection",
      year: 1,
    });
    expect(
      asOfView({ baseDate: monthEnd, asOf: isoDate("2028-02-29") }, false),
    ).toMatchObject({
      kind: "projection",
      year: 2,
    });
  });

  it("a non-today date under six months out shows the records in force", () => {
    const d = edate(baseDate, 3);
    expect(asOfView({ baseDate, asOf: d }, false)).toEqual({
      kind: "snapshot",
      date: d,
    });
  });

  it("the end of the window is the last projection year (ADR 0150)", () => {
    // resolveAsOf keeps every date inside the window, so there is no past-horizon basis.
    expect(
      asOfView({ baseDate, asOf: addYears(baseDate, 30) }, false),
    ).toMatchObject({
      kind: "projection",
      year: 30,
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

  // The KPI strip names its basis once (ADR 0200 §2); the picker hint gives the period.
  it("projection year: the Projections row label, the period in the picker hint", () => {
    const b = asOfView({ baseDate, asOf: plus5 }, false);
    expect(y5).toBe("Y5 · 2031");
    expect(period5).toBe("Jul 2030 – Jun 2031");
    expect(basisText(en, b)).toBe("projection year Y5 · 2031");
    expect(asOfHint(en, b, baseDate)).toBe(
      "Future dates show the nearest projection year (Y5 · 2031, Jul 2030 – Jun 2031)",
    );
    expect(basisText(en, b)).not.toMatch(/today|current/i);
  });

  it("today: current wording, no picker hint", () => {
    const b = asOfView({ baseDate, asOf: baseDate }, true);
    expect(basisText(en, b)).toBe("current");
    expect(asOfHint(en, b, baseDate)).toBeNull();
  });

  it("records in force on a date: dated wording, never today/current", () => {
    const d = edate(baseDate, 3);
    const b = asOfView({ baseDate, asOf: d }, false);
    expect(basisText(en, b)).toBe("on 07.09.2026");
    expect(asOfHint(en, b, baseDate)).toBe(
      "Showing records in force on 07.09.2026",
    );
  });

  it("horizon end year is the last projection row, whatever the as-of", () => {
    expect(horizonEndYear(series)).toBe(2056);
    expect(en.dashboard.bandHorizonCaption(2056, 30, "nominal")).toBe(
      "In 2056 · 30-yr horizon · nominal",
    );
  });
});

describe("ownedOn (ADR 0150)", () => {
  const y2 = { kind: "projection", year: 2, calendarYear: 2028 } as const;
  const asOf = isoDate("2028-01-01");

  it("in a projection year: owned once bought by that year's end", () => {
    expect(ownedOn(isoDate("2028-03-15"), y2, { baseDate, asOf })).toBe(true);
    expect(ownedOn(isoDate("2028-06-07"), y2, { baseDate, asOf })).toBe(true);
    expect(ownedOn(isoDate("2028-06-08"), y2, { baseDate, asOf })).toBe(false);
  });

  it("today or on a date: owned once bought by the as-of date", () => {
    const on = { kind: "snapshot", date: asOf } as const;
    expect(ownedOn(isoDate("2028-03-15"), on, { baseDate, asOf })).toBe(false);
    expect(ownedOn(isoDate("2028-01-01"), on, { baseDate, asOf })).toBe(true);
  });
});
