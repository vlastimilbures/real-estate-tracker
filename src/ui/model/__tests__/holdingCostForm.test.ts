// #484: the holding costs' form, out of the panel: its six fields, its draft and the
// record it saves (ADR 0207).
import { describe, expect, it } from "vitest";
import { money, rate, type HoldingCost } from "../../../engine";
import { en } from "../../../i18n/en";
import {
  holdingCostDraft,
  holdingCostFromForm,
  holdingCostSpecs,
} from "../holdingCosts";

const pd = en.propertyDetail;
const stored: HoldingCost = {
  id: "h1",
  propertyId: "p",
  propertyTaxYr: money("2550"),
  svjMonthly: money("850"),
  mgmtPctRent: rate("0.15"),
};

describe("holding cost form (ADR 0207)", () => {
  it("has six optional fields in the read view's order", () => {
    expect(
      holdingCostSpecs(en).map((s) => [s.name, s.label, s.kind, s.optional]),
    ).toEqual([
      ["propertyTaxYr", pd.fieldPropertyTax, "money", true],
      ["insuranceYr", pd.fieldInsurance, "money", true],
      ["svjMonthly", pd.fieldSvjMo, "money", true],
      ["otherYr", pd.fieldOther, "money", true],
      ["mgmtPctRent", pd.fieldMgmtPct, "pct", true],
      ["maintPctRent", pd.fieldMaintPct, "pct", true],
    ]);
  });

  it("drafts the stored costs, blank where none is set", () => {
    expect(holdingCostDraft(stored)).toEqual({
      propertyTaxYr: "2550",
      insuranceYr: "",
      svjMonthly: "850",
      otherYr: "",
      mgmtPctRent: "15",
      maintPctRent: "",
    });
    expect(Object.values(holdingCostDraft(undefined))).toEqual(
      Array(6).fill(""),
    );
  });

  it("saves under the stored record's id, a blank field unset", () => {
    const saved = holdingCostFromForm(
      {
        propertyTaxYr: money("3000"),
        insuranceYr: null,
        svjMonthly: null,
        otherYr: null,
        mgmtPctRent: rate("0.1"),
        maintPctRent: null,
      },
      "p",
      stored,
      () => "new",
    );
    expect(saved).toEqual({
      id: "h1",
      propertyId: "p",
      propertyTaxYr: money("3000"),
      insuranceYr: undefined,
      svjMonthly: undefined,
      otherYr: undefined,
      mgmtPctRent: rate("0.1"),
      maintPctRent: undefined,
    });
  });

  it("a property without costs gets a new id", () => {
    const blank = {
      propertyTaxYr: null,
      insuranceYr: null,
      svjMonthly: null,
      otherYr: null,
      mgmtPctRent: null,
      maintPctRent: null,
    };
    expect(holdingCostFromForm(blank, "p", undefined, () => "new").id).toBe(
      "new",
    );
  });
});
