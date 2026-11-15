// ADR 0207 (#385): the holding costs' read view: each field's stored value, or the
// portfolio default actually used, marked as the default.
import { describe, it, expect } from "vitest";
import { money, rate, type HoldingCost } from "../../../engine";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { holdingCostsView } from "../holdingCosts";

const p = en.propertyDetail;
const defaults = assumptions.defaults;

describe("holdingCostsView (ADR 0207 §1)", () => {
  it("lists the six costs in form order, each stored value as entered", () => {
    const h: HoldingCost = {
      id: "h",
      propertyId: "x",
      propertyTaxYr: money("2550"),
      insuranceYr: money("3100"),
      svjMonthly: money("850"),
      otherYr: money("0"),
      mgmtPctRent: rate("0.15"),
      maintPctRent: rate("0.05"),
    };
    expect(holdingCostsView(h, defaults, en)).toEqual([
      {
        label: p.fieldPropertyTax,
        kind: "money",
        value: h.propertyTaxYr,
        isDefault: false,
      },
      {
        label: p.fieldInsurance,
        kind: "money",
        value: h.insuranceYr,
        isDefault: false,
      },
      {
        label: p.fieldSvjMo,
        kind: "money",
        value: h.svjMonthly,
        isDefault: false,
      },
      {
        label: p.fieldOther,
        kind: "money",
        value: h.otherYr,
        isDefault: false,
      },
      {
        label: p.fieldMgmtPct,
        kind: "pct",
        value: h.mgmtPctRent,
        isDefault: false,
      },
      {
        label: p.fieldMaintPct,
        kind: "pct",
        value: h.maintPctRent,
        isDefault: false,
      },
    ]);
  });

  it("shows the portfolio default for a blank field, marked", () => {
    const h: HoldingCost = {
      id: "h",
      propertyId: "x",
      svjMonthly: money("850"),
    };
    const v = holdingCostsView(h, defaults, en);
    expect(v.map((r) => [r.value, r.isDefault])).toEqual([
      [defaults.propertyTaxYr, true],
      [defaults.insuranceYr, true],
      [h.svjMonthly, false],
      [defaults.otherYr, true],
      [defaults.mgmtPctRent, true],
      [defaults.maintPctRent, true],
    ]);
  });

  it("with no holding-cost record every field is the default", () => {
    const v = holdingCostsView(undefined, defaults, en);
    expect(v.every((r) => r.isDefault)).toBe(true);
    expect(v[0].value).toBe(defaults.propertyTaxYr);
  });
});
