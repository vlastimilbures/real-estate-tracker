// The P9 benchmark portfolio is valid engine input and exercises the non-seed paths:
// development loans with draws, a future purchase, a deactivated property, a refinance.
import { describe, it, expect } from "vitest";
import { validateInputs } from "../validate";
import { propertySchedule } from "../schedule";
import { assumptions } from "./support/seed";
import { synthetic } from "./support/synthetic";

describe("synthetic benchmark portfolio", () => {
  const p = synthetic(20);

  it("has 20 properties and only their rows", () => {
    const ids = new Set(p.properties.map((x) => x.id));
    expect(ids.size).toBe(20);
    for (const rows of [p.mortgages, p.valuations, p.leases, p.holdingCosts]) {
      expect(rows.every((r) => ids.has(r.propertyId))).toBe(true);
    }
  });

  it("is valid engine input", () => {
    expect(validateInputs(p, assumptions)).toEqual([]);
  });

  it("covers draws, future buys, inactive properties and refinances", () => {
    expect(p.mortgages.some((m) => m.draws?.length)).toBe(true);
    expect(
      p.properties.some((x) => x.purchaseDate > assumptions.baseDate),
    ).toBe(true);
    expect(p.properties.some((x) => x.active === false)).toBe(true);
    const refinanced = p.properties.filter(
      (x) =>
        propertySchedule(
          p.mortgages.filter((m) => m.propertyId === x.id),
          assumptions,
        ).refinances.length > 0,
    );
    expect(refinanced.length).toBeGreaterThan(0);
  });
});
