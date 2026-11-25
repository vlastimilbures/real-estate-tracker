// The engine's annuity maths without a sign convention (#477): each function equals the
// spreadsheet formula it replaced, as the engine called it, to all 40 digits, and the
// three agree with each other.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { D, type Decimal } from "../../lib/money";
import { annuityPayment, balanceAfter, paymentsToRepay } from "../finance";
import { FV, NPER, PMT } from "./support/excelFinance";
import { fcRuns } from "./support/fcRuns";

const { runs: RUNS, timeout: TIMEOUT } = fcRuns(477, 300);

/** Same value to the last digit (`equals`: −0 and 0 are one number). */
const same = (a: Decimal, b: Decimal) =>
  expect(a.isNaN() ? "NaN" : a.toFixed()).toBe(b.isNaN() ? "NaN" : b.toFixed());

/** A monthly rate: 0, or 0.01 % … 15 % a year, sometimes with 40 digits. */
const monthly = fc.oneof(
  fc.constant(D(0)),
  fc.integer({ min: 1, max: 1500 }).map((bp) => D(bp).div(120_000)),
  fc
    .tuple(fc.integer({ min: 1, max: 1500 }), fc.integer({ min: 1, max: 999 }))
    .map(([bp, x]) => D(bp).div(120_000).times(D(x).div(997))),
);
/** An amount: whole Kč, or a 40-digit balance as the schedule carries it. */
const amount = fc.oneof(
  fc.integer({ min: 1, max: 50_000_000 }).map((x) => D(x)),
  fc
    .tuple(
      fc.integer({ min: 1, max: 50_000_000 }),
      fc.integer({ min: 1, max: 9999 }),
    )
    .map(([x, y]) => D(x).div(D(y).div(7))),
);
const periods = fc.integer({ min: 1, max: 720 });

describe("annuityPayment", () => {
  it(
    "is Excel's PMT on the negated principal, digit for digit",
    { timeout: TIMEOUT },
    () => {
      fc.assert(
        fc.property(monthly, periods, amount, (r, n, p) => {
          same(annuityPayment(r, n, p), PMT(r, n, p.negated()));
        }),
        RUNS,
      );
    },
  );

  it("repays the principal over the term (the balance after n payments is ~0)", () => {
    const r = D("0.0169").div(12);
    const p = D("1912500");
    const pay = annuityPayment(r, 300, p);
    expect(pay.toFixed(2)).toBe("7820.69");
    expect(balanceAfter(r, 300, pay, p).abs().lt("1e-20")).toBe(true);
    expect(annuityPayment(D(0), 10, D(1000)).toFixed()).toBe("100");
  });
});

describe("annuityPayment of a zero principal", () => {
  // Excel's form, PMT(r, n, −0), gave −0 (−(+0)); this gives +0. Equal as numbers and not
  // observable: a zero principal is accepted by validateInputs, but fmtCzk shows both as
  // "0 Kč", CSV writes toString, and the mortgage form asks for a principal above 0.
  it("is +0, at a rate and at 0 %", () => {
    for (const r of [D("0.05").div(12), D(0)]) {
      const pay = annuityPayment(r, 360, D(0));
      expect(pay.isZero()).toBe(true);
      expect(pay.isNegative()).toBe(false);
      expect(PMT(r, 360, D(0).negated()).isNegative()).toBe(true);
    }
  });
});

describe("balanceAfter", () => {
  it(
    "is Excel's FV with the instalment paid out, negated, digit for digit",
    { timeout: TIMEOUT },
    () => {
      fc.assert(
        fc.property(monthly, periods, amount, amount, (r, n, pay, p) => {
          same(
            balanceAfter(r, n, pay, p),
            FV(r, n, pay.negated(), p).negated(),
          );
        }),
        RUNS,
      );
    },
  );

  it("is the straight-line rest at 0 % and negative once overpaid", () => {
    expect(balanceAfter(D(0), 10, D(100), D(1000)).toFixed()).toBe("0");
    expect(balanceAfter(D(0), 4, D(100), D(1000)).toFixed()).toBe("600");
    expect(balanceAfter(D("0.01"), 12, D(200), D(1000)).isNegative()).toBe(
      true,
    );
  });
});

describe("paymentsToRepay", () => {
  it(
    "is Excel's NPER with the instalment paid out, digit for digit",
    { timeout: TIMEOUT },
    () => {
      fc.assert(
        fc.property(monthly, amount, amount, (r, pay, b) => {
          same(paymentsToRepay(r, pay, b), NPER(r, pay.negated(), b));
        }),
        RUNS,
      );
    },
  );

  it("inverts annuityPayment and is NaN when the instalment never covers the interest", () => {
    const r = D("0.05").div(12);
    const p = D("1000000");
    const n = paymentsToRepay(r, annuityPayment(r, 360, p), p);
    expect(n.minus(360).abs().lt("1e-30")).toBe(true);
    expect(paymentsToRepay(r, p.times(r), p).isNaN()).toBe(true); // = the interest
    expect(paymentsToRepay(r, p.times(r).div(2), p).isNaN()).toBe(true);
    expect(paymentsToRepay(D(0), D(100), D(1000)).toFixed()).toBe("10");
  });
});
