// Monthly amortization schedules (SPEC §4.4): the engine's loan API. The code lives
// in `loan/*` (#474); this module re-exports its public symbols.

export { paymentOffset } from "./loan/calendar";
export { openingBalance, openingDebt } from "./loan/opening";
export {
  balanceAtMonth,
  instalmentAtMonth,
  hasPayment,
  lastPaymentMonth,
} from "./loan/queries";
export {
  /** @internal test seam: one loan's schedule; the app runs `propertySchedules`. */
  buildSchedule,
  effectiveMaturity,
  EMPTY_PROPERTY_SCHEDULE,
  propertySchedule,
  propertySchedules,
  scheduleRows,
  schedulesByProperty,
} from "./loan/chain";
export type { PropertySchedule } from "./loan/chain";
export {
  chainLinks,
  afterSuccessor,
  replacedOnOrBefore,
  replacedByMonth,
} from "./loan/blockChain";
export type { ChainLink } from "./loan/blockChain";
export { undrawnPrincipal } from "./loan/committedDebt";
