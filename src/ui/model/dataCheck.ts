// Pure model for the Data check (ADR 0118, #35): the inputs behind a property's numbers
// that are stale, missing or left at a portfolio default, at an explicit as-of date. It
// calls the engine's own selectors, so a finding appears exactly when the engine falls back.
import {
  edate,
  leaseEndWithoutFollowOn,
  leaseInForce,
  monthsBetween,
  selectValuation,
} from "../../engine";
import type {
  HoldingCost,
  IsoDate,
  Money,
  Portfolio,
  Property,
  Rate,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import { fmtCzk, fmtDate } from "../../lib/format";
import {
  loanWarnings,
  loanWarningText,
  type LoanWarning,
} from "./propertyDetail";
import type { PropertySection } from "./sectionNav";

/** A valuation more than this many months old at the as-of date is stale. */
export const VALUATION_STALE_MONTHS = 12;
/** A lease ending within this many months of the as-of date (that day included). */
export const LEASE_ENDING_MONTHS = 3;

/** The holding-cost fields, in the Holding costs form's order. */
const COST_FIELDS = [
  "propertyTaxYr",
  "insuranceYr",
  "svjMonthly",
  "otherYr",
  "mgmtPctRent",
  "maintPctRent",
] as const;
type CostField = (typeof COST_FIELDS)[number];

/** One data-check finding for a property. */
export type DataFinding =
  /** The valuation in use is more than 12 months old; `months` = whole months of age. */
  | { kind: "valuationStale"; validFrom: IsoDate; months: number }
  /** No valuation: the purchase price stands in as the market value. */
  | { kind: "noValuation"; purchasePrice: Money }
  /** No lease in force at the as-of date: rent counts as 0. */
  | { kind: "noLease"; asOf: Date }
  /** The lease in force ends within 3 months and no later lease is entered. */
  | { kind: "leaseEnding"; endDate: IsoDate }
  /** The fixation ended with no follow-on block (the Property detail loan warning). */
  | Extract<LoanWarning, { kind: "fixationEnded" }>
  /** The portfolio appreciation and/or rent indexation apply. */
  | { kind: "growthDefault"; appreciation: boolean; rentIndexation: boolean }
  /** These holding-cost fields fall back to the portfolio defaults. */
  | { kind: "costDefaults"; fields: CostField[] };

/** A property's findings: "needs attention" (counted) and "using portfolio defaults". */
export interface DataCheck {
  attention: DataFinding[];
  defaults: DataFinding[];
}

/** Where a finding is fixed: a Property detail section, or the property form. */
type DataCheckFix =
  Extract<PropertySection, "records" | "financing" | "holding"> | "edit";

/** The property's findings at `asOf`; none before its purchase date. */
export function propertyDataCheck(
  property: Property,
  portfolio: Portfolio,
  asOf: Date,
): DataCheck {
  if (property.purchaseDate.getTime() > asOf.getTime())
    return { attention: [], defaults: [] };
  const own = <T extends { propertyId: string }>(rows: T[]) =>
    rows.filter((r) => r.propertyId === property.id);
  const attention: DataFinding[] = [];

  const valuation = selectValuation(own(portfolio.valuations), asOf);
  if (!valuation)
    attention.push({
      kind: "noValuation",
      purchasePrice: property.purchasePrice,
    });
  else if (
    edate(valuation.validFrom, VALUATION_STALE_MONTHS).getTime() <
    asOf.getTime()
  )
    attention.push({
      kind: "valuationStale",
      validFrom: valuation.validFrom,
      months: monthsBetween(valuation.validFrom, asOf),
    });

  const leases = own(portfolio.leases);
  if (!leaseInForce(leases, asOf)) attention.push({ kind: "noLease", asOf });
  const leaseEnd = leaseEndWithoutFollowOn(leases, asOf);
  if (
    leaseEnd &&
    leaseEnd.getTime() <= edate(asOf, LEASE_ENDING_MONTHS).getTime()
  )
    attention.push({ kind: "leaseEnding", endDate: leaseEnd });

  for (const w of loanWarnings(own(portfolio.mortgages), asOf))
    if (w.kind === "fixationEnded") attention.push(w);

  return {
    attention,
    defaults: defaultsOf(property, own(portfolio.holdingCosts)[0]),
  };
}

/** Growth and holding-cost fields left to the portfolio defaults (first cost row wins). */
function defaultsOf(
  property: Property,
  cost: HoldingCost | undefined,
): DataFinding[] {
  const out: DataFinding[] = [];
  const appreciation = property.appreciationOverridePa === undefined;
  const rentIndexation = property.rentIndexOverridePa === undefined;
  if (appreciation || rentIndexation)
    out.push({ kind: "growthDefault", appreciation, rentIndexation });
  const fields = COST_FIELDS.filter((f) => cost?.[f] === undefined);
  if (fields.length > 0) out.push({ kind: "costDefaults", fields });
  return out;
}

/** The Dashboard's check: active properties with a finding, in portfolio order. */
export function portfolioDataCheck(
  portfolio: Portfolio,
  asOf: Date,
): (DataCheck & { propertyId: string; name: string })[] {
  return portfolio.properties
    .filter((p) => p.active !== false)
    .map((p) => ({
      propertyId: p.id,
      name: p.name,
      ...propertyDataCheck(p, portfolio, asOf),
    }))
    .filter((c) => c.attention.length + c.defaults.length > 0);
}

/** Where the finding is fixed. */
export function findingFix(f: DataFinding): DataCheckFix {
  switch (f.kind) {
    case "valuationStale":
    case "noValuation":
    case "noLease":
    case "leaseEnding":
      return "records";
    case "fixationEnded":
      return "financing";
    case "costDefaults":
      return "holding";
    case "growthDefault":
      return "edit";
  }
}

/** The finding and its effect as one or two sentences in the user's language. */
export function findingText(
  t: Pick<Dictionary, "dataCheck" | "propertyDetail">,
  f: DataFinding,
  resetRate: Rate,
): string {
  const d = t.dataCheck;
  switch (f.kind) {
    case "valuationStale":
      return d.valuationStale(
        t.propertyDetail.monthsCount(f.months),
        fmtDate(f.validFrom),
      );
    case "noValuation":
      return d.noValuation(fmtCzk(f.purchasePrice));
    case "noLease":
      return d.noLease(fmtDate(f.asOf));
    case "leaseEnding":
      return d.leaseEnding(fmtDate(f.endDate));
    case "fixationEnded":
      return loanWarningText(t, f, resetRate);
    case "growthDefault":
      return f.appreciation && f.rentIndexation
        ? d.growthBoth
        : f.appreciation
          ? d.growthAppreciation
          : d.growthRentIndexation;
    case "costDefaults":
      return d.costDefaults(
        f.fields.map((field) => costLabel(t, field)).join(", "),
      );
  }
}

function costLabel(t: Pick<Dictionary, "propertyDetail">, f: CostField) {
  const d = t.propertyDetail;
  const labels: Record<CostField, string> = {
    propertyTaxYr: d.fieldPropertyTax,
    insuranceYr: d.fieldInsurance,
    svjMonthly: d.fieldSvjMo,
    otherYr: d.fieldOther,
    mgmtPctRent: d.fieldMgmtPct,
    maintPctRent: d.fieldMaintPct,
  };
  return labels[f];
}
