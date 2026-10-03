// Parity — Byt Javorova amortization (engine-parity.md "Amortization"). Table-driven over
// PARITY. DR-033: every row asserted at ±1 Kč (was ±5/±10 Kč for m55/m56/m300).
import { describe, it, expect } from "vitest";
import { buildSchedule } from "../../schedule";
import { ZERO } from "../../../lib/money";
import { assumptions, portfolio, PARITY } from "../support/seed";
import { expectKc } from "../support/tolerance";

const petr = portfolio.mortgages.find((m) => m.propertyId === "javorova")!;
const schedule = buildSchedule(petr, assumptions);
const row = (m: number) => schedule[m - 1];

describe("Amortization — Byt Javorova", () => {
  for (const [month, target] of Object.entries(PARITY.amortization)) {
    it(`month ${month}: interest / principal / end balance`, () => {
      const r = row(Number(month));
      expectKc(r.interest, target.interest, `m${month} interest`);
      expectKc(r.principal, target.principal, `m${month} principal`);
      expectKc(r.endBalance, target.endBalance, `m${month} balance`);
    });
  }
  it("month 56 is the payment due on the fixation end (2031-01-17): still 1.69 %, 6,721.8", () => {
    expect(row(55).ratePa.toNumber()).toBeCloseTo(0.0169, 6);
    expect(row(56).ratePa.toNumber()).toBeCloseTo(0.0169, 6);
    expectKc(row(56).instalment, 6_721.8, "m56 instalment");
  });
  it("month 57: rate resets to 4.5 %, instalment re-amortizes ≈ 8,681.46 (D-21)", () => {
    expect(row(57).ratePa.toNumber()).toBeCloseTo(0.045, 6);
    expectKc(row(57).instalment, 8_681.46, "m57 instalment");
  });
  it("month 306: fully repaid — no phantom instalment", () => {
    expectKc(row(306).instalment, 0, "m306 instalment");
    expectKc(row(306).interest, 0, "m306 interest");
    expectKc(row(306).principal, 0, "m306 principal");
    expectKc(row(306).endBalance, 0, "m306 balance");
  });
});

describe("Invariant — Σ principal over horizon = initial (baseDate) debt", () => {
  it("each property's principal retires 100% of its starting balance", () => {
    for (const block of portfolio.mortgages) {
      const sched = buildSchedule(block, assumptions);
      const sumPrincipal = sched.reduce((s, r) => s.plus(r.principal), ZERO);
      const startBalance = sched[0].endBalance.plus(sched[0].principal);
      expectKc(
        sumPrincipal,
        startBalance.toNumber(),
        `${block.propertyId} Σprincipal`,
      );
    }
  });
});
