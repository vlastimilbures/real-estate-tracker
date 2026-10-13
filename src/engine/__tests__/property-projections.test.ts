// #265, #147 R2-18: every property's projection in one public call, validated once
// (DR-128). Each entry equals the single-property call, inactive properties included.
import { describe, expect, it } from "vitest";
import { propertyProjection, propertyProjections } from "../projections";
import { EMPTY_PROPERTY_SCHEDULE, propertySchedules } from "../schedule";
import type { Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { mixed } from "./support/mixed";

describe("propertyProjections", () => {
  for (const [name, p] of [
    ["seed", portfolio],
    ["mixed (future, development, inactive)", mixed],
  ] as [string, Portfolio][]) {
    it(`${name}: each property equals propertyProjection`, () => {
      const built = propertySchedules(
        p.mortgages,
        p.properties.map((x) => x.id),
        assumptions,
      );
      const all = propertyProjections(p, assumptions);
      expect([...all.keys()]).toEqual(p.properties.map((x) => x.id));
      for (const x of p.properties)
        expect(all.get(x.id)).toEqual(
          propertyProjection(
            x,
            p,
            assumptions,
            built.get(x.id) ?? EMPTY_PROPERTY_SCHEDULE,
          ),
        );
      expect(propertyProjections(p, assumptions, built)).toEqual(all);
    });
  }
});
