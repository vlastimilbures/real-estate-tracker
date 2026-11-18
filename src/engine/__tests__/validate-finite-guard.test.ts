// One error per non-finite amount (ADR 0251 §1–2): a −Infinity principal, instalment or
// price reports NON_FINITE_NUMBER alone, and the loan assert still refuses the loan. The
// block entry points run first in a child process (support/bounded.ts), so a loan the
// assert let through cannot hang the suite.
import { describe, expect, it } from "vitest";
import { money, rate } from "../brands";
import { EngineInputError } from "../errors";
import { assertLoanInputs, validatePortfolio } from "../validate";
import { portfolio } from "./support/seed";
import { loan, onLoan, withLoan } from "./support/loan";
import { BOUNDED_TIMEOUT as TIMEOUT, bounded } from "./support/bounded";
import {
  entryPointOutcomes,
  type FiniteGuardCase,
} from "./support/finiteGuard";
import type { MortgageBlockFields } from "../types";

const SUPPORT = new URL("./support/finiteGuard.ts", import.meta.url).href;

const loanErrors = (b: Partial<MortgageBlockFields>) =>
  validatePortfolio(withLoan(b));

/** What `assertLoanInputs` raised on `b`, or "returned". */
function asserted(b: Partial<MortgageBlockFields>) {
  try {
    assertLoanInputs(loan(b));
    return "returned";
  } catch (e) {
    if (!(e instanceof EngineInputError)) throw e;
    return e.errors;
  }
}

describe("a non-finite amount reports once (ADR 0251 §1)", () => {
  it("−Infinity principal: NON_FINITE_NUMBER alone", () => {
    expect(loanErrors({ initialPrincipal: money(-Infinity) })).toStrictEqual([
      onLoan("NON_FINITE_NUMBER", "initialPrincipal"),
    ]);
  });

  it("−Infinity instalment on a loan with a term: NON_FINITE_NUMBER alone", () => {
    expect(
      loanErrors({ loanTermYears: 30, monthlyInstalment: money(-Infinity) }),
    ).toStrictEqual([onLoan("NON_FINITE_NUMBER", "monthlyInstalment")]);
  });

  it("−Infinity instalment on an NPER loan still reports the instalment rule", () => {
    // Known (ADR 0251, parked P2): the derived-term check does not guard the instalment.
    expect(loanErrors({ monthlyInstalment: money(-Infinity) })).toStrictEqual([
      onLoan("NON_FINITE_NUMBER", "monthlyInstalment"),
      onLoan("INSTALMENT_BELOW_INTEREST", "monthlyInstalment"),
    ]);
  });

  it("−Infinity purchase price: NON_FINITE_NUMBER alone", () => {
    const [p, ...rest] = portfolio.properties;
    expect(
      validatePortfolio({
        ...portfolio,
        properties: [{ ...p!, purchasePrice: money(-Infinity) }, ...rest],
      }),
    ).toStrictEqual([
      {
        code: "NON_FINITE_NUMBER",
        entity: "property",
        id: p!.id,
        field: "purchasePrice",
      },
    ]);
  });

  it("a finite negative amount keeps its sign code, −0 as before", () => {
    expect(loanErrors({ initialPrincipal: money(-1) })).toStrictEqual([
      onLoan("NEGATIVE_PRINCIPAL", "initialPrincipal"),
    ]);
    expect(
      loanErrors({ loanTermYears: 30, monthlyInstalment: money(-1) }),
    ).toStrictEqual([onLoan("NEGATIVE_AMOUNT", "monthlyInstalment")]);
    // decimal.js keeps the sign of −0, so it is a finite negative amount (unchanged).
    expect(
      loanErrors({ loanTermYears: 30, initialPrincipal: money(-0) }),
    ).toStrictEqual([onLoan("NEGATIVE_PRINCIPAL", "initialPrincipal")]);
  });
});

describe("the loan assert refuses a non-finite loan amount (ADR 0251 §2)", () => {
  it("−Infinity principal: [NON_FINITE_NUMBER], was [NEGATIVE_PRINCIPAL]", () => {
    expect(asserted({ initialPrincipal: money(-Infinity) })).toStrictEqual([
      onLoan("NON_FINITE_NUMBER", "initialPrincipal"),
    ]);
  });

  it("+Infinity or NaN principal is refused too", () => {
    for (const v of [Infinity, NaN])
      expect(asserted({ initialPrincipal: money(v) }), String(v)).toStrictEqual(
        [onLoan("NON_FINITE_NUMBER", "initialPrincipal")],
      );
  });

  it("a non-finite instalment is refused", () => {
    for (const v of [-Infinity, Infinity, NaN])
      expect(
        asserted({ loanTermYears: 30, monthlyInstalment: money(v) }),
        String(v),
      ).toStrictEqual([onLoan("NON_FINITE_NUMBER", "monthlyInstalment")]);
  });

  it("a non-finite rate stays a data problem only", () => {
    expect(asserted({ interestRatePa: rate(NaN) })).toBe("returned");
  });
});

const refused = (field: string) => [`NON_FINITE_NUMBER ${field}`];

/** Every block entry point refuses the loan, in a child process first. */
function expectRefused(
  name: FiniteGuardCase,
  field: string,
  undrawn: unknown = refused(field),
) {
  const expected = {
    effectiveMaturity: refused(field),
    openingBalance: refused(field),
    undrawnPrincipal: undrawn,
  };
  expect(bounded(SUPPORT, "entryPointOutcomes", name)).toEqual(expected);
  expect(entryPointOutcomes(name)).toEqual(expected);
}

describe("the block entry points refuse a non-finite loan amount (ADR 0251 §2)", () => {
  // `undrawnPrincipal` counts development loans only: a plain loan returns before the
  // assert.
  for (const name of [
    "plainPrincipalMinusInf",
    "plainPrincipalPlusInf",
    "plainPrincipalNaN",
  ] as const)
    it(name, TIMEOUT, () =>
      expectRefused(name, "initialPrincipal", "returned"),
    );

  for (const name of ["termInstalmentMinusInf", "termInstalmentNaN"] as const)
    it(name, TIMEOUT, () =>
      expectRefused(name, "monthlyInstalment", "returned"),
    );

  for (const name of ["devPrincipalMinusInf", "devPrincipalNaN"] as const)
    it(name, TIMEOUT, () => expectRefused(name, "initialPrincipal"));

  it("devInstalmentPlusInf", TIMEOUT, () =>
    expectRefused("devInstalmentPlusInf", "monthlyInstalment"),
  );
});
