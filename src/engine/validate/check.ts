// The checks every validator shares (#479): the error builders and reporters, the
// field tests, the sign-rule tables and the amount check.
import { ZERO, type Decimal } from "../../lib/money";
import { atOrBelowGrowthFloor, outsideUnitRate } from "../../lib/rules";
import { EngineInputError } from "../errors";
import { COST_KEYS, COST_MONEY_KEYS, COST_RATE_KEYS } from "../figures";
import type { CostDefaults, HoldingCost } from "../types";
import type {
  CostFieldAs,
  EngineValidationError,
  FieldOf,
  ValidationCode,
  ValidationEntity,
  ValidationField,
} from "./codes";

/** A check's reporter: a problem on one of the fields `F` (ADR 0251 §4). */
export type Report<F extends string = ValidationField> = (
  code: ValidationCode,
  field?: F,
  index?: number,
) => void;

/** Where a reporter puts the errors it builds. */
export type Add = (e: EngineValidationError) => void;

/** The entities that are rows with an id: all but the assumptions. */
export type RowEntity = Exclude<ValidationEntity, "assumptions">;

/** A row's error: `field` always present, `index` only for a list item (ADR 0116). */
export function rowError<E extends RowEntity>(
  { entity, id }: { entity: E; id: string },
  code: ValidationCode,
  field: FieldOf<E> | undefined,
  index?: number,
): EngineValidationError {
  return {
    code,
    entity,
    id,
    field,
    ...(index === undefined ? {} : { index }),
  };
}

/** An assumptions error: no row id. */
export function assumptionError(
  code: ValidationCode,
  field: FieldOf<"assumptions"> | undefined,
): EngineValidationError {
  return { code, entity: "assumptions", field };
}

/** The reporter of one row: every problem becomes `rowError` on it (#479). */
export function rowReporter<E extends RowEntity>(
  entity: E,
  id: string,
  add: Add,
): Report<FieldOf<E>> {
  return (code, field, index) =>
    add(rowError({ entity, id }, code, field, index));
}

/** The reporter of the assumptions: every problem becomes `assumptionError`. */
export function assumptionReporter(add: Add): Report<FieldOf<"assumptions">> {
  return (code, field) => add(assumptionError(code, field));
}

export const badDate = (d: Date | undefined) =>
  d !== undefined && Number.isNaN(d.getTime());
export const badNumber = (d: Decimal | undefined) =>
  d !== undefined && !d.isFinite();
/** A fraction that must lie in [0, 1] (vacancy, cost shares, a value haircut). */
export const outsideUnit = (d: Decimal | undefined) =>
  d !== undefined && d.isFinite() && outsideUnitRate(d);

/** A growth rate at or below −100 % (ADR 0128): a yearly factor of zero or less. */
export const belowGrowthFloor = (d: Decimal | undefined) =>
  d !== undefined && d.isFinite() && atOrBelowGrowthFloor(d);

/** A finite amount below zero (a non-finite one is NON_FINITE_NUMBER instead). */
export const isNegativeAmount = (d: Decimal | undefined) =>
  d !== undefined && d.isFinite() && d.isNegative();

export const notPositive = (d: Decimal) => !d.greaterThan(ZERO);

/** Finite-number / valid-date checks over an object's fields: the dates, then the
 *  numbers. */
export function checkFields<
  D extends ValidationField,
  N extends ValidationField,
>(
  row: { readonly [F in D]?: Date | undefined } & {
    readonly [F in N]?: Decimal | undefined;
  },
  dates: readonly D[],
  numbers: readonly N[],
  report: Report<D | N>,
): void {
  for (const f of dates) {
    if (badDate(row[f])) report("INVALID_DATE", f);
  }
  for (const f of numbers) {
    if (badNumber(row[f])) report("NON_FINITE_NUMBER", f);
  }
}

/** One sign or range rule of a row: `test` true ⇒ `code` on `field`. A rule on an
 *  optional field needs a test that takes undefined. */
export type SignRule<R, K extends keyof R> = readonly [
  field: K,
  test: (d: R[K]) => boolean,
  code: ValidationCode,
];

/** Sign and range rules over a row, in table order: each rule is one pass over its
 *  field, so a row with several bad fields reports rule by rule (#479). `prefix` goes
 *  before each field name. */
export function checkSigns<
  R,
  K extends keyof R & string,
  P extends string = "",
>(
  row: R,
  rules: readonly SignRule<R, K>[],
  report: Report<NoInfer<`${P}${K}`>>,
  prefix = "" as P,
): void {
  for (const [f, test, code] of rules) {
    // A template expression types as string: this one is `${P}${K}`.
    if (test(row[f])) report(code, `${prefix}${f}` as `${P}${K}`);
  }
}

/** An amount: NON_FINITE_NUMBER, else `code` when `bad`. */
export function checkAmount<T extends Decimal | undefined>(
  amount: T,
  bad: (amount: T) => boolean,
  code: ValidationCode,
  issue: (code: ValidationCode) => void,
): void {
  if (badNumber(amount)) issue("NON_FINITE_NUMBER");
  else if (bad(amount)) issue(code);
}

/** ADR 0038 shares and ADR 0075 non-negative costs on the assumption defaults (`prefix`
 *  "defaults."), and the same bounds on a holding-cost row (ADR 0036). The Kč fields are
 *  reported first, then the shares. */
export function checkCostRanges<P extends "" | "defaults.">(
  c: CostDefaults | HoldingCost,
  prefix: P,
  report: Report<CostFieldAs<P>>,
): void {
  checkSigns<CostDefaults | HoldingCost, CostKey, P>(
    c,
    COST_SIGNS,
    report,
    prefix,
  );
}

/** The holding costs' rules: the Kč fields, then the shares. */
type CostKey = (typeof COST_KEYS)[number];

const COST_SIGNS: readonly SignRule<CostDefaults | HoldingCost, CostKey>[] = [
  ...COST_MONEY_KEYS.map(
    (f) => [f, isNegativeAmount, "NEGATIVE_AMOUNT"] as const,
  ),
  ...COST_RATE_KEYS.map((f) => [f, outsideUnit, "RATE_OUT_OF_RANGE"] as const),
];

/** Raise an EngineInputError listing `errors`, if there are any. */
export function raise(errors: EngineValidationError[]): void {
  if (errors.length > 0) throw new EngineInputError(errors);
}
