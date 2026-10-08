// ADR 0156: the property tiles' `owned` follows `ownedOn` under the as-of basis, on every
// basis kind and lens, so the tiles, the subtitle and the Properties row agree.
import { describe, it, expect } from "vitest";
import {
  propertyProjection,
  propertySnapshot,
  schedulesByProperty,
  isoDate,
  type IsoDate,
} from "../../../engine";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { projectionSeries } from "../projection";
import { asOfView, propertyTilesForAsOf } from "../dashboard";
import type { Mode } from "../lens";

const schedules = schedulesByProperty(
  mixed.mortgages,
  mixed.properties.map((p) => p.id),
  assumptions,
);
const future = mixed.properties.find((p) => p.id === "future")!;
const schedule = schedules.get(future.id) ?? [];

function ownedAt(asOf: IsoDate, mode: Mode, isToday = false): boolean {
  const series = projectionSeries(
    propertyProjection(future, mixed, assumptions, schedule),
    mode,
    assumptions,
  );
  return propertyTilesForAsOf(
    propertySnapshot(future, mixed, assumptions, asOf, schedule),
    series,
    asOfView(assumptions.baseDate, asOf, series, isToday),
    asOf,
    mode,
    assumptions,
    future.purchaseDate,
  ).owned;
}

describe("propertyTilesForAsOf owned (purchase 15.03.2028, base 07.06.2026)", () => {
  for (const mode of ["nominal", "real"] as const) {
    it(`${mode}: today and a records-in-force date are before the purchase`, () => {
      expect(ownedAt(assumptions.baseDate, mode, true)).toBe(false);
      expect(ownedAt(isoDate("2026-09-01"), mode)).toBe(false);
    });

    it(`${mode}: a projection year by its year-end`, () => {
      // Year 1 ends 07.06.2027: not yet bought.
      expect(ownedAt(isoDate("2027-06-07"), mode)).toBe(false);
      // 01.02.2028 rounds to year 2, which ends 07.06.2028: bought in that year.
      expect(ownedAt(isoDate("2028-02-01"), mode)).toBe(true);
      expect(ownedAt(isoDate("2030-06-07"), mode)).toBe(true);
    });
  }
});
