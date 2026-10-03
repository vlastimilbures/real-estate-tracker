// Shared parity tolerances (CLAUDE.md "Testing & definition of done"; DR-062). Never widen
// these to make a test pass (standing rule 8).
import { expect } from "vitest";
import type { Decimal } from "../../../lib/money";

/** Money: ±1 Kč. */
export const KC = 1;
/** Ratios, rates and multiples: ±0.0001. */
export const RATIO = 0.0001;

type Num = number | Decimal;
const num = (v: Num): number => (typeof v === "number" ? v : v.toNumber());

/** |actual − expected| ≤ tol, with a readable failure label. */
export function near(actual: Num, expected: number, tol: number, label = "") {
  const a = num(actual);
  expect(
    Math.abs(a - expected),
    `${label}: ${a} vs ${expected}`,
  ).toBeLessThanOrEqual(tol);
}

export const expectKc = (actual: Num, expected: number, label = "") =>
  near(actual, expected, KC, label);

export const expectRatio = (actual: Num, expected: number, label = "") =>
  near(actual, expected, RATIO, label);
