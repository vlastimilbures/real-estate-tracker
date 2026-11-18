// Loans with a non-finite principal or instalment, run through the block entry points
// that rely on `assertLoanInputs` (ADR 0251 §2). Shared by validate-finite-guard.test.ts
// and the child process it runs each case in first: a loan the assert let through could
// build an endless schedule, which would hang the suite instead of failing it.
import { money } from "../../brands";
import { EngineInputError } from "../../errors";
import { effectiveMaturity } from "../../loan/chain";
import { openingBalance } from "../../loan/opening";
import { undrawnPrincipal } from "../../loan/committedDebt";
import type { MortgageBlock } from "../../types";
import { assumptions, portfolio } from "./seed";
import { devBlock } from "./mixed";
import { loan } from "./loan";

/** A dev loan on the seed's first property: `undrawnPrincipal` asserts dev loans only. */
const dev = (b: Partial<MortgageBlock>): MortgageBlock =>
  ({ ...devBlock, id: "m-x", propertyId: "javorova", ...b }) as MortgageBlock;

const CASES = {
  plainPrincipalMinusInf: loan({ initialPrincipal: money(-Infinity) }),
  plainPrincipalPlusInf: loan({ initialPrincipal: money(Infinity) }),
  plainPrincipalNaN: loan({ initialPrincipal: money(NaN) }),
  termInstalmentMinusInf: loan({
    loanTermYears: 30,
    monthlyInstalment: money(-Infinity),
  }),
  termInstalmentNaN: loan({ loanTermYears: 30, monthlyInstalment: money(NaN) }),
  devPrincipalMinusInf: dev({ initialPrincipal: money(-Infinity) }),
  devPrincipalNaN: dev({ initialPrincipal: money(NaN) }),
  devInstalmentPlusInf: dev({ monthlyInstalment: money(Infinity) }),
} satisfies Record<string, MortgageBlock>;

export type FiniteGuardCase = keyof typeof CASES;

/** What one entry point did: the codes and fields it raised, or "returned". */
function outcome(fn: () => unknown): unknown {
  try {
    fn();
    return "returned";
  } catch (e) {
    if (!(e instanceof EngineInputError)) return String(e);
    return e.errors.map((x) => `${x.code} ${x.field ?? ""}`);
  }
}

/** Each block entry point's outcome on the loan `name`. */
export function entryPointOutcomes(name: string): Record<string, unknown> {
  const b = CASES[name as FiniteGuardCase];
  const property = portfolio.properties[0]!;
  return {
    effectiveMaturity: outcome(() => effectiveMaturity(b, assumptions)),
    openingBalance: outcome(() => openingBalance(b, assumptions)),
    undrawnPrincipal: outcome(() =>
      undrawnPrincipal(property, [b], assumptions, 0),
    ),
  };
}
