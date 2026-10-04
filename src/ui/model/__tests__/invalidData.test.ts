import { describe, it, expect } from "vitest";
import { invalidDataLines } from "../invalidData";
import { getDict } from "../../../i18n";
import {
  portfolio,
  withPropertyId,
} from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const nameOf = (id: string) =>
  portfolio.properties.find((p) => p.id === id)!.name;

describe("invalidDataLines", () => {
  it("resolves each row to its property, once per line", () => {
    const v = portfolio.valuations[0];
    const l = portfolio.leases[0];
    const h = portfolio.holdingCosts[0];
    const lines = invalidDataLines(
      en,
      [
        { code: "NEGATIVE_AMOUNT", entity: "valuation", id: v.id },
        { code: "NEGATIVE_AMOUNT", entity: "valuation", id: v.id },
        { code: "END_BEFORE_START", entity: "lease", id: l.id },
        { code: "RATE_OUT_OF_RANGE", entity: "holdingCost", id: h.id },
        { code: "INVALID_DATE", entity: "property", id: v.propertyId },
      ],
      portfolio,
    );
    expect(lines).toEqual([
      {
        text: `${nameOf(v.propertyId)}: ${en.inputRules.NEGATIVE_AMOUNT}`,
        propertyId: v.propertyId,
      },
      {
        text: `${nameOf(l.propertyId)}: ${en.inputRules.END_BEFORE_START}`,
        propertyId: l.propertyId,
      },
      {
        text: `${nameOf(h.propertyId)}: ${en.inputRules.RATE_OUT_OF_RANGE}`,
        propertyId: h.propertyId,
      },
      {
        text: `${nameOf(v.propertyId)}: ${en.inputRules.INVALID_DATE}`,
        propertyId: v.propertyId,
      },
    ]);
  });

  it('keeps the link for a property stored with the id "" (ADR 0127)', () => {
    const pf = withPropertyId("lipova", "");
    const v = pf.valuations.find((x) => x.propertyId === "")!;
    expect(
      invalidDataLines(
        en,
        [
          { code: "INVALID_DATE", entity: "property", id: "" },
          { code: "NEGATIVE_AMOUNT", entity: "valuation", id: v.id },
        ],
        pf,
      ),
    ).toEqual([
      { text: `Byt Lipova: ${en.inputRules.INVALID_DATE}`, propertyId: "" },
      { text: `Byt Lipova: ${en.inputRules.NEGATIVE_AMOUNT}`, propertyId: "" },
    ]);
  });

  it("labels assumptions and unknown rows without a property", () => {
    expect(
      invalidDataLines(
        en,
        [
          { code: "HORIZON_NOT_POSITIVE", entity: "assumptions" },
          { code: "NEGATIVE_AMOUNT", entity: "lease", id: "gone" },
        ],
        portfolio,
      ),
    ).toEqual([
      { text: `Assumptions: ${en.inputRules.HORIZON_NOT_POSITIVE}` },
      { text: `A record: ${en.inputRules.NEGATIVE_AMOUNT}` },
    ]);
    expect(
      invalidDataLines(
        en,
        [{ code: "NEGATIVE_AMOUNT", entity: "lease", id: "x" }],
        null,
      ),
    ).toEqual([{ text: `A record: ${en.inputRules.NEGATIVE_AMOUNT}` }]);
  });
});
