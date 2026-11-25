// Which block funded a property's purchase (ADR 0119 §3, ADR 0168). Apart from
// ./acquisition, which reaches the schedules: the schedule's committed debt reads it.
import { addDays, isOnOrBefore } from "./dates";
import { isDevLoan } from "./loanBlock";
import type { MortgageBlock, Property } from "./types";

/** A block starting up to this many days after the purchase funded it (ADR 0119 §3). */
const ACQUISITION_LOAN_WINDOW_DAYS = 90;

/** ADR 0119 §3: the property's earliest block funded the purchase when it starts no later
 *  than 90 days after it; any earlier start counts too (an off-plan loan drawn before
 *  handover). A development loan funds it whatever its start: the bank pays the developer,
 *  never the owner (ADR 0168). */
export function fundedThePurchase(
  property: Property,
  block: MortgageBlock,
): boolean {
  if (isDevLoan(block)) return true;
  const latest = addDays(property.purchaseDate, ACQUISITION_LOAN_WINDOW_DAYS);
  return isOnOrBefore(block.startDate, latest);
}
