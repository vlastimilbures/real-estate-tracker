// Test helper: each property's schedule rows in one call. The engine's one entry point
// is `propertySchedules`; this is `scheduleRows` over it, as the engine's callers do (#477).
import { propertySchedules, scheduleRows } from "../../schedule";
import type { AmortizationRow, Assumptions, MortgageBlock } from "../../types";

/** Build schedules for every property keyed by propertyId (empty if no debt). */
export function schedulesByProperty(
  mortgages: MortgageBlock[],
  propertyIds: string[],
  assumptions: Assumptions,
): Map<string, AmortizationRow[]> {
  return scheduleRows(propertySchedules(mortgages, propertyIds, assumptions));
}
