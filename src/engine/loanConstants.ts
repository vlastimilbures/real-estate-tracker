// Named loan and debt thresholds. Changing one moves outputs and needs an approved
// decision.
import { D } from "../lib/money";
import { INT_RANGES } from "../lib/rules";
import { yearsToMonths } from "./units";

/** A portfolio balance at or below this (Kč) counts as debt-free. */
export const DEBT_FREE_EPSILON = D("0.005");

/** Longest loan, in payments from its start, a recast may run to (ADR 0109): the
 *  longest loan term a form or CSV accepts (`INT_RANGES.loanTermYears`, 50 years: 600
 *  payments), unless the contract term is longer. The one maximum the engine reads
 *  (ADR 0244). */
export const MAX_LOAN_TERM_MONTHS = yearsToMonths(INT_RANGES.loanTermYears.max);

/** Residual balance at term end (Kč) up to which an instalment "fully amortizes". */
export const FULLY_AMORTIZES_TOLERANCE = D("1");
