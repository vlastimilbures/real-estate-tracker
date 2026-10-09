// The owner's cash outside net cash flow, by projection year (SPEC §4.6, #117):
// acquisitions out, net refinance cash in (D-47), prepayments and their fees out
// (ADR 0109), and the debt service paid before a future buy turns on (ADR 0124).
// Net cash flow minus it is the owner's flow the cumulative cash flow and IRR sum.
import { ZERO, type Decimal } from "../lib/money";
import {
  acquisitionSummary,
  laterFirstLoan,
  repaidBeforeBase,
} from "./acquisition";
import { at } from "./arrays";
import type { PropertySchedule } from "./schedule";
import { turnOnYear, yearSlice } from "./yearGrid";
import type { Assumptions, Portfolio, Property } from "./types";

/** A property's schedule from the shared map (every property id has an entry). */
export function scheduleOf(
  schedules: Map<string, PropertySchedule>,
  propertyId: string,
): PropertySchedule {
  return (
    schedules.get(propertyId) ?? { rows: [], refinances: [], eventOutcomes: [] }
  );
}

/**
 * Down-payment outflows by projection year: a property bought *after* baseDate turns
 * its equity on at tStart > 0, so its down payment (the recorded own cash, else price −
 * acquisition loan + costs + works, ADR 0119) is paid in year tStart; levered IRR /
 * cumulative CF aren't flattered by free terminal equity. With it goes the principal its
 * acquisition loan repaid before baseDate (ADR 0134). A first loan that did not fund
 * the purchase, or one drawn after baseDate on a property owned at baseDate (ADR 0134),
 * pays its initial principal back to the owner, as cash in (a negative outflow) in the
 * year it is drawn. All zero when every property is owned and every first loan was drawn
 * by baseDate (the seed ⇒ parity targets unchanged).
 */
export function acquisitionOutflows(
  properties: Property[],
  portfolio: Portfolio,
  assumptions: Assumptions,
): Decimal[] {
  const N = assumptions.horizonYears;
  const out: Decimal[] = Array.from({ length: N + 1 }, () => ZERO);
  for (const p of properties) {
    const tStart = turnOnYear(p.purchaseDate, assumptions);
    if (tStart > N) continue;
    if (tStart > 0) {
      out[tStart] = at(out, tStart)
        .plus(acquisitionSummary(p, portfolio, assumptions).outflow)
        .plus(repaidBeforeBase(p, portfolio, assumptions));
    }
    const late = laterFirstLoan(p, portfolio, assumptions);
    const tLoan = late ? turnOnYear(late.startDate, assumptions) : N + 1;
    if (late && tLoan <= N) {
      out[tLoan] = at(out, tLoan).minus(late.initialPrincipal);
    }
  }
  return out;
}

/**
 * Net refinance cash by projection year (D-47): a successor's balance drawn − the
 * predecessor balance it pays off, in the year of its handover month. Positive for a
 * cash-out refinance, negative for a pay-down. All zero without successors (the seed
 * ⇒ parity targets unchanged).
 */
export function refinanceCash(
  properties: Property[],
  assumptions: Assumptions,
  schedules: Map<string, PropertySchedule>,
): Decimal[] {
  const N = assumptions.horizonYears;
  const out: Decimal[] = Array.from({ length: N + 1 }, () => ZERO);
  for (const p of properties) {
    for (const r of scheduleOf(schedules, p.id).refinances) {
      const t = Math.ceil(r.month / 12);
      if (t <= N) out[t] = at(out, t).plus(r.drawn).minus(r.paidOff);
    }
  }
  return out;
}

/** What a loan's schedule takes from the owner in one projection year. */
export interface DebtServicePaid {
  interest: Decimal;
  principal: Decimal;
  prepaid: Decimal;
  prepaymentFees: Decimal;
}

/**
 * ADR 0124 (#104): the debt service the owner pays before a future buy turns on, by
 * projection year (index 0..N, year 0 always zero). A loan drawn before the purchase
 * date runs its schedule while the property's rows are still empty (years before
 * tStart), so its interest, principal, prepaid and fees are owner cash outside the rows.
 * The same months and fields as the rows (`yearSlice`); draws are the bank's money and
 * arrive as the turn-on year's carried-in debt (DR-092). Zero for an all-owned portfolio.
 */
export function prePurchaseDebtService(
  properties: Property[],
  assumptions: Assumptions,
  schedules: Map<string, PropertySchedule>,
): DebtServicePaid[] {
  const N = assumptions.horizonYears;
  const out: DebtServicePaid[] = Array.from({ length: N + 1 }, () => ({
    interest: ZERO,
    principal: ZERO,
    prepaid: ZERO,
    prepaymentFees: ZERO,
  }));
  for (const p of properties) {
    const schedule = scheduleOf(schedules, p.id).rows;
    const last = Math.min(turnOnYear(p.purchaseDate, assumptions) - 1, N);
    for (let t = 1; t <= last; t++) {
      const slice = yearSlice(schedule, t);
      const y = at(out, t);
      out[t] = {
        interest: y.interest.plus(slice.interest),
        principal: y.principal.plus(slice.principal),
        prepaid: y.prepaid.plus(slice.prepaid),
        prepaymentFees: y.prepaymentFees.plus(slice.prepaymentFees),
      };
    }
  }
  return out;
}

/**
 * Cash outside net cash flow by projection year (index 0..N) for `properties` (the
 * active ones): acquisitions out (down payment and the principal repaid before
 * baseDate, less a later first loan's principal in; `acquisitionOutflows`), net
 * refinance cash in (D-47), prepayments and their fees out (ADR 0109; read from `rows`,
 * the projection of the same properties), and the debt service paid before a future
 * buy turns on (ADR 0124).
 */
export function cashOutsideNetCf(
  properties: Property[],
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules: Map<string, PropertySchedule>,
  rows: { prepaid: Decimal; prepaymentFees: Decimal }[],
): Decimal[] {
  const refiCash = refinanceCash(properties, assumptions, schedules);
  const prePurchase = prePurchaseDebtService(
    properties,
    assumptions,
    schedules,
  );
  return acquisitionOutflows(properties, portfolio, assumptions).map((x, t) => {
    const pre = at(prePurchase, t);
    return x
      .minus(at(refiCash, t))
      .plus(at(rows, t).prepaid)
      .plus(at(rows, t).prepaymentFees)
      .plus(pre.interest)
      .plus(pre.principal)
      .plus(pre.prepaid)
      .plus(pre.prepaymentFees);
  });
}
