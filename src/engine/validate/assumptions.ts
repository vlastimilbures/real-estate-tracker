// The assumptions' checks: fields, level ranges, cost defaults and shocks (ADR 0037, ADR 0038,
// ADR 0128).
import type { Decimal } from "../../lib/money";
import type { Assumptions, CostDefaults, ShockBand } from "../types";
import {
  badNumber,
  belowGrowthFloor,
  checkAmount,
  checkCostRanges,
  checkFields,
  checkSigns,
  outsideUnit,
  type Report,
  type SignRule,
} from "./check";
import type { FieldOf } from "./codes";

/** The assumptions' reporter: a problem on an assumption field. */
type AssumptionReport = Report<FieldOf<"assumptions">>;

/** A shock band's duration: whole years ≥ 0 (ADR 0038). */
const badDuration = (band: ShockBand) =>
  !Number.isInteger(band.durationYears) || band.durationYears < 0;

/** A shock band: a finite delta, then a whole-year duration (ADR 0251 §3). */
function checkShock(
  band: ShockBand | undefined,
  field: "inflationShock" | "rateShock",
  report: AssumptionReport,
): void {
  if (!band) return;
  checkAmount(
    band.deltaPa,
    () => badDuration(band),
    "SHOCK_OUT_OF_RANGE",
    (c) => report(c, field),
  );
}

export function checkAssumptions(
  a: Assumptions,
  report: AssumptionReport,
): void {
  const rates = [
    "appreciationPa",
    "rentIndexationPa",
    "vacancyAllowance",
    "postFixationResetRatePa",
    "inflationPa",
    "sellingCostPct",
  ] as const;
  checkFields(a, ["baseDate"], rates, report);
  // Every own key in its own order, a key the type does not name too.
  const defaults = Object.keys(a.defaults) as (keyof CostDefaults)[];
  checkFields(a.defaults, [], defaults, report);
  if (!Number.isInteger(a.horizonYears) || a.horizonYears <= 0) {
    report("HORIZON_NOT_POSITIVE", "horizonYears");
  }
  checkLevelRanges(a, report);
  checkCostRanges(a.defaults, "defaults.", report);
  checkShock(a.inflationShock, "inflationShock", report);
  checkShock(a.rateShock, "rateShock", report);
  // ADR 0128 §3: a shock shifts a level, so the shifted level keeps the level's bound.
  checkShiftedLevel(a.postFixationResetRatePa, a.rateShock, outsideUnit, () =>
    report("SHOCKED_RATE_OUT_OF_RANGE", "rateShock"),
  );
  checkShiftedLevel(a.inflationPa, a.inflationShock, belowGrowthFloor, () =>
    report("SHOCKED_INFLATION_OUT_OF_RANGE", "inflationShock"),
  );
  checkValueShock(a.valueShock, report);
}

/** The assumption levels bounded below by −100 % (ADR 0128 §2). */
const GROWTH_FIELDS = [
  "appreciationPa",
  "rentIndexationPa",
  "inflationPa",
] as const;

/** ADR 0038 and ADR 0128 §1–2 ranges of the assumption levels. */
function checkLevelRanges(a: Assumptions, report: AssumptionReport): void {
  checkSigns(a, LEVEL_SIGNS, report);
}

const LEVEL_SIGNS: readonly SignRule<
  Assumptions,
  | "vacancyAllowance"
  | "sellingCostPct"
  | "postFixationResetRatePa"
  | (typeof GROWTH_FIELDS)[number]
>[] = [
  ["vacancyAllowance", outsideUnit, "RATE_OUT_OF_RANGE"],
  // ADR 0183: a fraction of the projected value at the horizon.
  ["sellingCostPct", outsideUnit, "RATE_OUT_OF_RANGE"],
  // ADR 0128 §1: the reset rate is an interest rate (ADR 0038).
  ["postFixationResetRatePa", outsideUnit, "RATE_OUT_OF_RANGE"],
  ...GROWTH_FIELDS.map(
    (f) => [f, belowGrowthFloor, "GROWTH_OUT_OF_RANGE"] as const,
  ),
];

/**
 * ADR 0128 §3: `level` + the shock's delta must stay in the level's own range. Checked
 * only when the level and the shock pass their own rules, so one typo gives one message.
 */
function checkShiftedLevel(
  level: Decimal,
  band: ShockBand | undefined,
  outOfRange: (d: Decimal) => boolean,
  report: () => void,
): void {
  if (!band || badNumber(band.deltaPa) || badDuration(band)) return;
  if (badNumber(level)) return;
  if (outOfRange(level)) return;
  if (outOfRange(level.plus(band.deltaPa))) report();
}

/** A value crash: a finite haircut within 0–1 at a whole year ≥ 0 (ADR 0038, ADR 0128 §4,
 *  ADR 0251 §3). */
function checkValueShock(
  vs: Assumptions["valueShock"],
  report: AssumptionReport,
): void {
  if (!vs) return;
  checkAmount(
    vs.pct,
    (p) => outsideUnit(p) || !Number.isInteger(vs.atYear) || vs.atYear < 0,
    "SHOCK_OUT_OF_RANGE",
    (c) => report(c, "valueShock"),
  );
}
