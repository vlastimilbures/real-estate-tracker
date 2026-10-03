// Parity — current snapshot (engine-parity.md "Current snapshot"). Table-driven over PARITY.
import { describe, it, expect } from "vitest";
import { portfolioSnapshot, leaseInForce } from "../../metrics";
import type { Decimal } from "../../../lib/money";
import {
  assumptions,
  portfolio,
  PARITY,
  RATIO_KEYS,
  type PropertyId,
} from "../support/seed";
import { KC, RATIO, near } from "../support/tolerance";

const snap = portfolioSnapshot(portfolio, assumptions);
const byId = (id: string) => snap.perProperty.find((p) => p.propertyId === id)!;
const tol = (key: string) => (RATIO_KEYS.has(key) ? RATIO : KC);

describe("Current snapshot — portfolio", () => {
  for (const [key, target] of Object.entries(PARITY.snapshot)) {
    it(key, () => {
      const actual = snap[key as keyof typeof PARITY.snapshot] as Decimal;
      near(actual, target, tol(key), key);
    });
  }
});

describe("Current snapshot — per property", () => {
  for (const [id, row] of Object.entries(PARITY.perProperty)) {
    for (const [key, target] of Object.entries(row)) {
      it(`${id} ${key}`, () => {
        const actual = byId(id as PropertyId)[
          key as keyof typeof row
        ] as Decimal;
        near(actual, target, tol(key), `${id} ${key}`);
      });
    }
  }
});

describe("Effective-dating", () => {
  it("Lipova rent in force at baseDate is 21,675 (not 23,205)", () => {
    const lease = leaseInForce(
      portfolio.leases.filter((l) => l.propertyId === "lipova"),
      assumptions.baseDate,
    );
    expect(lease?.monthlyRent.toNumber()).toBe(21_675);
  });
});
