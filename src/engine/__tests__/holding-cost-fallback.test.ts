// `effectiveCosts` falls back to assumption defaults per-field (metrics.ts:87). The
// seed's holdingFor() sets every field, so the fallback arm of pick() never runs on
// the seed. A partial HoldingCost (some fields undefined) must take the entered value
// for the set fields and the default for the unset ones — independently. Guards the
// Excel "blank cell silently zeros a cost" bug class (CLAUDE.md §7).
import { describe, it, expect } from "vitest";
import { effectiveCosts } from "../metrics";
import { assumptions } from "./support/seed";
import type { HoldingCost } from "../types";
import { money } from "../brands";

describe("effectiveCosts — per-field independent fallback", () => {
  // svjMonthly entered (overrides default 2000); insuranceYr omitted (→ default 3000).
  const partial: HoldingCost = {
    id: "hc-partial",
    propertyId: "p1",
    svjMonthly: money("1000"),
  };
  const c = effectiveCosts(partial, assumptions);

  it("set field uses the entered value", () =>
    expect(c.svjMonthly.toNumber()).toBe(1000));
  it("unset field falls back to the default (not zero)", () =>
    expect(c.insuranceYr.toNumber()).toBe(
      assumptions.defaults.insuranceYr.toNumber(),
    ));
  it("other unset fields each fall back independently", () => {
    expect(c.propertyTaxYr.toNumber()).toBe(
      assumptions.defaults.propertyTaxYr.toNumber(),
    );
    expect(c.mgmtPctRent.toNumber()).toBe(
      assumptions.defaults.mgmtPctRent.toNumber(),
    );
    expect(c.maintPctRent.toNumber()).toBe(
      assumptions.defaults.maintPctRent.toNumber(),
    );
    expect(c.otherYr.toNumber()).toBe(assumptions.defaults.otherYr.toNumber());
  });
});
