// P3: Nominal/Real lens invariants (SPEC §4.5 "Real terms") and the projection period
// labels. Real = nominal ÷ (1+inflation)^t; year 0 is identical in both lenses; LTV and
// DSCR are ratios and must be identical every year.
import { describe, it, expect } from "vitest";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import {
  portfolioSnapshot,
  portfolioProjection,
  isoDate,
  realPropertySnapshot,
} from "../../../engine";
import { D, ONE } from "../../../lib/money";
import { en } from "../../../i18n/en";
import {
  projectionSeries,
  periodLabelLocalized,
  showPeriodColumn,
} from "../projection";

const proj = portfolioProjection(portfolio, assumptions);
const nominal = projectionSeries(proj, "nominal", assumptions);
const real = projectionSeries(proj, "real", assumptions);

const MONEY_KEYS = [
  "value",
  "balance",
  "equity",
  "grossRent",
  "effectiveRent",
  "holdingCosts",
  "noi",
  "interest",
  "principal",
  "debtService",
  "netCashFlow",
  "draws",
] as const;

describe("Nominal/Real lens invariants", () => {
  it("year 0: real == nominal for every field", () => {
    expect(real[0]).toEqual(nominal[0]);
  });

  it("LTV and DSCR are identical in nominal and real, every year", () => {
    for (let t = 0; t < nominal.length; t++) {
      expect(real[t].ltv.toString(), `ltv t=${t}`).toBe(
        nominal[t].ltv.toString(),
      );
      expect(String(real[t].dscr), `dscr t=${t}`).toBe(String(nominal[t].dscr));
    }
  });

  it("every money field is nominal ÷ (1+inflation)^t", () => {
    for (let t = 0; t < nominal.length; t++) {
      const k = ONE.plus(assumptions.inflationPa).pow(t);
      for (const key of MONEY_KEYS) {
        const want = nominal[t][key].div(k);
        expect(
          real[t][key].minus(want).abs().lte(D("1e-9")),
          `${key} t=${t}`,
        ).toBe(true);
      }
    }
  });

  it("nominal rows carry the engine values; draws ≈ 0 (decimal dust only) for plain loans from year 1", () => {
    for (let t = 0; t < proj.length; t++)
      expect(nominal[t].value.toString()).toBe(proj[t].value.toString());
    for (let t = 1; t < proj.length; t++)
      expect(nominal[t].draws.abs().lt(D("1e-20")), `draws t=${t}`).toBe(true);
    // Year 0 is the opening position: no flow, so no draws (DR-092; it used to carry the
    // balance back-out, and the chart drops that row either way).
    expect(nominal[0].draws.isZero()).toBe(true);
  });
});

describe("realPropertySnapshot", () => {
  const snap = portfolioSnapshot(portfolio, assumptions).perProperty[0];
  it("k = 1 returns the same object (no-op)", () => {
    expect(realPropertySnapshot(snap, ONE)).toBe(snap);
  });
  it("divides money fields by k and leaves ratios untouched", () => {
    const k = D(2);
    const s = realPropertySnapshot(snap, k);
    expect(s.value.toString()).toBe(snap.value.div(2).toString());
    expect(s.debt.toString()).toBe(snap.debt.div(2).toString());
    expect(s.netCashFlow.toString()).toBe(snap.netCashFlow.div(2).toString());
    expect(s.ltv).toBe(snap.ltv);
    expect(s.dscr).toBe(snap.dscr);
    expect(s.grossYield).toBe(snap.grossYield);
  });
});

describe("projection period labels", () => {
  const base = assumptions.baseDate; // 2026-06-07
  it("year 0 is the opening row; year t spans grid months (t−1)·12+1 … t·12", () => {
    const label = (y: number) =>
      periodLabelLocalized(base, y, en.monthsShort, en.projGrid.opening);
    expect(label(0)).toBe("opening");
    expect(label(1)).toBe("Jul 2026 – Jun 2027");
    expect(label(5)).toBe("Jul 2030 – Jun 2031");
  });
  it("the localized variant uses the supplied month names and opening label", () => {
    const months = [
      "led",
      "úno",
      "bře",
      "dub",
      "kvě",
      "čvn",
      "čvc",
      "srp",
      "zář",
      "říj",
      "lis",
      "pro",
    ];
    expect(periodLabelLocalized(base, 0, months, "počátek")).toBe("počátek");
    expect(periodLabelLocalized(base, 1, months, "počátek")).toBe(
      "čvc 2026 – čvn 2027",
    );
  });
  it("the Period column shows only when the fiscal year is not the calendar year", () => {
    expect(showPeriodColumn(base)).toBe(true);
    expect(showPeriodColumn(isoDate("2025-12-15"))).toBe(false); // grid starts in Jan
    expect(showPeriodColumn(isoDate("2026-01-15"))).toBe(true);
  });
});
