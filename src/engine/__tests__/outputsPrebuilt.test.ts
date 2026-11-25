// #469: `portfolioOutputs` takes prebuilt loan schedules, as `propertyProjections` and
// `portfolioProjection` already do, so a caller that holds them does not build them
// again. The result is the self-built one, from the given schedules.
import { describe, it, expect } from "vitest";
import { edate } from "../dates";
import { propertySchedules } from "../schedule";
import { portfolioOutputs } from "../outputs";
import type { Portfolio } from "../types";
import { assumptions, portfolio as seed } from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedWithRefi } from "./support/synthetic";

const built = (p: Portfolio) =>
  propertySchedules(
    p.mortgages,
    p.properties.map((x) => x.id),
    assumptions,
  );

describe("portfolioOutputs with prebuilt schedules", () => {
  const asOf = edate(assumptions.baseDate, 30);
  for (const [name, p] of [
    ["seed", seed],
    ["mixed", mixed],
    ["mixed + refinance", mixedWithRefi],
  ] as const) {
    it(`${name}: equals the self-built result`, () => {
      expect(portfolioOutputs(p, assumptions, asOf, built(p))).toEqual(
        portfolioOutputs(p, assumptions, asOf),
      );
    });
  }

  it("returns the given schedules' rows", () => {
    const schedules = built(seed);
    const out = portfolioOutputs(
      seed,
      assumptions,
      assumptions.baseDate,
      schedules,
    );
    for (const [pid, s] of schedules) {
      expect(out.schedules.get(pid)).toBe(s.rows);
    }
  });
});
