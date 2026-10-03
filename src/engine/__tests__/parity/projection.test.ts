// Parity — 30-year projection KPIs (engine-parity.md "30-year projection"). Table-driven
// over PARITY, plus the Σ principal tripwire.
import { describe, it, expect } from "vitest";
import { portfolioKpis } from "../../kpis";
import { portfolioSnapshot } from "../../metrics";
import type { Decimal } from "../../../lib/money";
import { assumptions, portfolio, PARITY, RATIO_KEYS } from "../support/seed";
import { KC, RATIO, near } from "../support/tolerance";

const kpis = portfolioKpis(portfolio, assumptions);
type KpiKey = keyof typeof PARITY.kpis;

describe("30-year projection — portfolio KPIs", () => {
  for (const [key, target] of Object.entries(PARITY.kpis)) {
    it(key, () => {
      const actual = kpis[key as KpiKey];
      if (typeof actual === "number" || actual === null) {
        // Calendar-year KPIs are exact integers.
        expect(actual).toBe(target);
      } else {
        near(actual as Decimal, target, RATIO_KEYS.has(key) ? RATIO : KC, key);
      }
    });
  }
});

describe("Σ principal invariant (the critical tripwire)", () => {
  it("total principal repaid over 30y == initial total debt", () => {
    const snap = portfolioSnapshot(portfolio, assumptions);
    near(
      kpis.totalPrincipalRepaid,
      snap.totalDebt.toNumber(),
      KC,
      "Σprincipal == initial debt",
    );
    near(
      kpis.totalPrincipalRepaid,
      PARITY.snapshot.totalDebt,
      KC,
      "Σprincipal target",
    );
  });
});
