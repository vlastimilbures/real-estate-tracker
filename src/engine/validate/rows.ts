// The portfolio rows' checks: properties, mortgages, valuations, leases and holding
// costs, with orphans and duplicates across rows (D-37, D-38).
import type { Decimal } from "../../lib/money";
import { isAfter } from "../dates";
import { COST_KEYS } from "../figures";
import { overlappingLeases } from "../succession";
import type { AcquisitionFunding, Portfolio, Property } from "../types";
import type { EngineValidationError, FieldOf, ValidationField } from "./codes";
import {
  badDate,
  belowGrowthFloor,
  checkAmount,
  checkCostRanges,
  checkFields,
  checkSigns,
  isNegativeAmount,
  rowError,
  rowReporter,
  type Report,
  type RowEntity,
  type SignRule,
} from "./check";
import { duplicateStarts, refinancesWithinAMonth } from "./blockStarts";
import { blockIssues } from "./loan";

/** Effective-dated rows: valid dates, finite non-negative amount, end ≥ start. */
function checkDated<F extends ValidationField>(
  start: Date,
  end: Date | undefined,
  amount: Decimal,
  fields: readonly [start: F, end: F, amount: F],
  report: Report<F>,
): void {
  if (badDate(start)) report("INVALID_DATE", fields[0]);
  if (badDate(end)) report("INVALID_DATE", fields[1]);
  if (end && isAfter(start, end)) report("END_BEFORE_START", fields[1]);
  checkAmount(amount, isNegativeAmount, "NEGATIVE_AMOUNT", (code) =>
    report(code, fields[2]),
  );
}

type ReporterFor = <E extends RowEntity>(
  entity: E,
  id: string,
  propertyId?: string,
) => Report<FieldOf<E>>;

/** A holding-cost row's numbers: the Kč fields, then the shares. */
const HOLDING_COST_FIELDS = [...COST_KEYS];

/** The Kč parts of a property's funding record (ADR 0119). */
const FUNDING_MONEY = ["ownCash", "transactionCosts", "initialWorks"] as const;

const FUNDING_SIGNS: readonly SignRule<
  AcquisitionFunding,
  (typeof FUNDING_MONEY)[number]
>[] = FUNDING_MONEY.map(
  (f) => [f, isNegativeAmount, "NEGATIVE_AMOUNT"] as const,
);

const PRICE_SIGNS: readonly SignRule<Property, "purchasePrice">[] = [
  ["purchasePrice", isNegativeAmount, "NEGATIVE_AMOUNT"],
];

const GROWTH_OVERRIDES: readonly SignRule<
  Property,
  "appreciationOverridePa" | "rentIndexOverridePa"
>[] = [
  ["appreciationOverridePa", belowGrowthFloor, "GROWTH_OUT_OF_RANGE"],
  ["rentIndexOverridePa", belowGrowthFloor, "GROWTH_OUT_OF_RANGE"],
];

function checkProperties(p: Portfolio, on: ReporterFor): void {
  for (const x of p.properties) {
    const report = on("property", x.id);
    checkFields(
      x,
      ["purchaseDate"],
      ["purchasePrice", "appreciationOverridePa", "rentIndexOverridePa"],
      report,
    );
    checkSigns(x, PRICE_SIGNS, report);
    // ADR 0128 §2: a property's own growth keeps the assumption floor.
    checkSigns(x, GROWTH_OVERRIDES, report);
    // ADR 0119 §7: flat field names, so a restore maps them to their columns.
    const funding = x.funding ?? {};
    checkFields(funding, [], FUNDING_MONEY, report);
    checkSigns(funding, FUNDING_SIGNS, report);
  }
}

function checkMortgages(p: Portfolio, on: ReporterFor): void {
  const dupes = duplicateStarts(p.mortgages);
  const quick = refinancesWithinAMonth(p.mortgages);
  for (const b of p.mortgages) {
    const report = on("mortgage", b.id, b.propertyId);
    for (const issue of blockIssues(b)) report(...issue);
    if (dupes.has(b)) report("DUPLICATE_BLOCK_START", "startDate");
    if (quick.has(b)) report("REFINANCE_WITHIN_A_MONTH", "startDate");
  }
}

function checkValuationsAndLeases(p: Portfolio, on: ReporterFor): void {
  for (const v of p.valuations) {
    checkDated(
      v.validFrom,
      v.validTo,
      v.marketValue,
      ["validFrom", "validTo", "marketValue"],
      on("valuation", v.id, v.propertyId),
    );
  }
  for (const l of p.leases) {
    checkDated(
      l.startDate,
      l.endDate,
      l.monthlyRent,
      ["startDate", "endDate", "monthlyRent"],
      on("lease", l.id, l.propertyId),
    );
  }
}

function checkHoldingCosts(p: Portfolio, on: ReporterFor): void {
  const owners = new Set<string>();
  for (const h of p.holdingCosts) {
    const report = on("holdingCost", h.id, h.propertyId);
    checkFields(h, [], HOLDING_COST_FIELDS, report);
    checkCostRanges(h, "", report); // D-54 (DR-127): the defaults' bounds
    if (owners.has(h.propertyId)) report("DUPLICATE_HOLDING_COST"); // DR-071
    owners.add(h.propertyId);
  }
}

/** ORPHAN_ROW on a row whose property does not exist. */
const orphanError = (entity: RowEntity, id: string): EngineValidationError => ({
  code: "ORPHAN_ROW",
  entity,
  id,
  field: "propertyId",
});

/** Every per-row check, plus orphans and duplicates across rows. */
export function checkPortfolio(
  p: Portfolio,
  add: (e: EngineValidationError) => void,
): void {
  const ids = new Set(p.properties.map((x) => x.id));
  const on: ReporterFor = (entity, id, propertyId) => {
    // Reported as the reporter is made, so a row's ORPHAN_ROW comes first. Only a row
    // that names its property passes `propertyId`: the property itself never does.
    if (propertyId !== undefined && !ids.has(propertyId))
      add(orphanError(entity, id));
    return rowReporter(entity, id, add);
  };
  checkProperties(p, on);
  checkMortgages(p, on);
  checkValuationsAndLeases(p, on);
  checkHoldingCosts(p, on);
}

/**
 * The portfolio rows' problems only (validateInputs without the assumptions), for
 * entry points that write portfolio rows: CSV import and restore (P5b).
 */
export function validatePortfolio(
  portfolio: Portfolio,
): EngineValidationError[] {
  const errors: EngineValidationError[] = [];
  checkPortfolio(portfolio, (e) => errors.push(e));
  return errors;
}

/**
 * LEASE_OVERLAP on each lease that overlaps another lease of its property (ADR 0163),
 * once per lease, in start order. A write-time rule: the store and CSV import apply it to
 * the rows they write. It is not part of `validatePortfolio`/`validateInputs`, so a
 * stored overlap from before the rule still loads and restores (the Data check lists it).
 */
export function leaseOverlapErrors(
  portfolio: Portfolio,
): EngineValidationError[] {
  const named = new Set<string>();
  for (const pair of overlappingLeases(portfolio.leases))
    for (const l of pair) named.add(l.id);
  return [...named].map((id) =>
    rowError("lease", id, "LEASE_OVERLAP", "startDate"),
  );
}
