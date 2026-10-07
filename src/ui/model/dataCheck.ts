// Pure model for the Data check (ADR 0118, #35): the inputs behind a property's numbers
// that are stale, missing or left at a portfolio default, at an explicit as-of date. It
// calls the engine's own selectors, so a finding appears exactly when the engine falls back.
import {
  basisDate,
  edate,
  leaseEndWithoutFollowOn,
  leaseInForce,
  monthsBetween,
  renewedLease,
  selectValuation,
} from "../../engine";
import type {
  HoldingCost,
  IsoDate,
  Money,
  MortgageBlock,
  Portfolio,
  Property,
  Rate,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import { fmtCzk, fmtDate } from "../../lib/format";
import { outOfRangeFields, type IntRange } from "../../lib/intRanges";
import {
  loanWarnings,
  loanWarningText,
  type LoanWarning,
} from "./propertyDetail";
import type { PropertyFormTarget, PropertySection } from "./sectionNav";

/** A valuation more than this many months old at the as-of date is stale. */
const VALUATION_STALE_MONTHS = 12;
/** A lease ending within this many months of the as-of date (that day included). */
const LEASE_ENDING_MONTHS = 3;

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
  /** No valuation recorded: the purchase price stands in as the market value (ADR 0122). */
  | { kind: "noValuation"; purchasePrice: Money; asOf: Date }
  /** No lease in force at the as-of date and none the projection renews: rent is 0. */
  | { kind: "noLease"; asOf: Date }
  /** The last lease ended before the as-of date: the snapshot has no rent after it, the
   *  projection treats it as renewed (`renewedLease`). */
  | { kind: "leaseEnded"; endDate: IsoDate }
  /** The lease in force ends within 3 months and no later lease is entered. */
  | { kind: "leaseEnding"; endDate: IsoDate }
  /** The fixation ended with no follow-on block (the Property detail loan warning). */
  | Extract<LoanWarning, { kind: "fixationEnded" }>
  /** The portfolio appreciation and/or rent indexation apply. */
  | { kind: "growthDefault"; appreciation: boolean; rentIndexation: boolean }
  /** These holding-cost fields fall back to the portfolio defaults. */
  | { kind: "costDefaults"; fields: CostField[] }
  /** No own cash recorded (ADR 0119): Cash invested is unknown; for a property bought
   *  after the base date (`future`) the projection derives its down payment. */
  | { kind: "fundingUnknown"; future: boolean }
  /** A stored whole number outside the range the forms accept (ADR 0148): a legacy
   *  database keeps it, and a restore asks about it. `loanStart` names the mortgage. */
  | {
      kind: "outOfRange";
      field: "sizeM2" | "fixationYears" | "loanTermYears" | "horizonYears";
      value: number;
      range: IntRange;
      loanStart?: IsoDate;
    };

/** A property's findings: "needs attention" (counted) and "using portfolio defaults". */
export interface DataCheck {
  attention: DataFinding[];
  defaults: DataFinding[];
}

/** One row of a Data check list: the finding and its property (`null` for a portfolio
 *  row, such as the projection horizon). */
export interface DataCheckItem {
  propertyId: string | null;
  name: string | null;
  finding: DataFinding;
}

/** Where a finding is fixed: a Property detail section, the property form (with its
 *  Acquisition section open for `editFunding`), or Settings → Assumptions. */
export type DataCheckFix =
  | Extract<PropertySection, "records" | "financing" | "holding">
  | PropertyFormTarget
  | "assumptions";

/** The property's findings at `asOf`; before its purchase date only the own-cash one.
 *  `baseDate` = the projection start, for what the projection assumes about an ended
 *  lease and whether it derives the down payment. */
export function propertyDataCheck(
  property: Property,
  portfolio: Portfolio,
  asOf: Date,
  baseDate: Date,
): DataCheck {
  const own = <T extends { propertyId: string }>(rows: T[]) =>
    rows.filter((r) => r.propertyId === property.id);
  // Stored values, not dated: listed at any as-of date.
  const outOfRange = rangeFindings(property, own(portfolio.mortgages));
  if (property.purchaseDate.getTime() > asOf.getTime())
    return { attention: outOfRange, defaults: fundingOf(property, baseDate) };
  const attention: DataFinding[] = [];

  const valuation = selectValuation(own(portfolio.valuations), asOf);
  if (!valuation)
    attention.push({
      kind: "noValuation",
      purchasePrice: property.purchasePrice,
      asOf,
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
  if (!leaseInForce(leases, asOf)) {
    const ended = renewedLease(leases, basisDate(property, baseDate))?.endDate;
    attention.push(
      ended && ended.getTime() < asOf.getTime()
        ? { kind: "leaseEnded", endDate: ended }
        : { kind: "noLease", asOf },
    );
  }
  const leaseEnd = leaseEndWithoutFollowOn(leases, asOf);
  if (
    leaseEnd &&
    leaseEnd.getTime() <= edate(asOf, LEASE_ENDING_MONTHS).getTime()
  )
    attention.push({ kind: "leaseEnding", endDate: leaseEnd });

  for (const w of loanWarnings(own(portfolio.mortgages), asOf))
    if (w.kind === "fixationEnded") attention.push(w);
  attention.push(...outOfRange);

  return {
    attention,
    defaults: [
      ...defaultsOf(property, own(portfolio.holdingCosts)[0]),
      ...fundingOf(property, baseDate),
    ],
  };
}

/** The property's size and its mortgages' fixation and term outside the form ranges. */
function rangeFindings(
  property: Property,
  mortgages: MortgageBlock[],
): DataFinding[] {
  return outOfRangeFields({ properties: [property], mortgages }).map(
    ({ id, field, value, range }) => {
      const loanStart = mortgages.find((m) => m.id === id)?.startDate;
      return {
        kind: "outOfRange",
        field,
        value,
        range,
        ...(field !== "sizeM2" && loanStart && { loanStart }),
      };
    },
  );
}

/** The portfolio's own findings (ADR 0148): a stored projection horizon outside the form
 *  range, as a row without a property. */
export function portfolioDataCheck(horizonYears: number): DataCheckItem[] {
  return outOfRangeFields(
    { properties: [], mortgages: [] },
    { horizonYears },
  ).map(({ field, value, range }) => ({
    propertyId: null,
    name: null,
    finding: { kind: "outOfRange", field, value, range },
  }));
}

/** No own cash recorded (#178): a record with only costs, works or a note counts too. */
function fundingOf(property: Property, baseDate: Date): DataFinding[] {
  if (property.funding?.ownCash !== undefined) return [];
  const future = property.purchaseDate.getTime() > baseDate.getTime();
  return [{ kind: "fundingUnknown", future }];
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

/** These properties' findings as the two lists, each row with its property, in the
 *  given order (the Dashboard passes its active properties, Property detail its own). */
export function dataCheckItems(
  properties: Property[],
  portfolio: Portfolio,
  asOf: Date,
  baseDate: Date,
): { attention: DataCheckItem[]; defaults: DataCheckItem[] } {
  const checks = properties.map((p) => ({
    p,
    check: propertyDataCheck(p, portfolio, asOf, baseDate),
  }));
  const rows = (group: keyof DataCheck) =>
    checks.flatMap(({ p, check }) =>
      check[group].map((finding) => ({
        propertyId: p.id,
        name: p.name,
        finding,
      })),
    );
  return { attention: rows("attention"), defaults: rows("defaults") };
}

/** Where the finding is fixed. */
export function findingFix(f: DataFinding): DataCheckFix {
  switch (f.kind) {
    case "valuationStale":
    case "noValuation":
    case "noLease":
    case "leaseEnded":
    case "leaseEnding":
      return "records";
    case "fixationEnded":
      return "financing";
    case "costDefaults":
      return "holding";
    case "growthDefault":
      return "edit";
    case "fundingUnknown":
      return "editFunding";
    case "outOfRange":
      return f.field === "sizeM2"
        ? "edit"
        : f.field === "horizonYears"
          ? "assumptions"
          : "financing";
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
    case "leaseEnded":
      return d.leaseEnded(fmtDate(f.endDate));
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
    case "fundingUnknown":
      return f.future ? d.fundingUnknownFuture : d.fundingUnknown;
    case "outOfRange": {
      const n = (v: number) => fmtCzk(v, { suffix: false });
      const value = n(f.value);
      const range = `${n(f.range.min)}–${n(f.range.max)}`;
      const loan = f.loanStart ? fmtDate(f.loanStart) : "";
      switch (f.field) {
        case "sizeM2":
          return d.outOfRangeSize(value, range);
        case "fixationYears":
          return d.outOfRangeFixation(loan, value, range);
        case "loanTermYears":
          return d.outOfRangeTerm(loan, value, range);
        case "horizonYears":
          return d.outOfRangeHorizon(value, range);
      }
    }
  }
}

/** The fix link's label: the section it moves to, or the property form. */
export function fixLabel(
  t: Pick<Dictionary, "dataCheck" | "propertyDetail" | "properties">,
  fix: DataCheckFix,
): string {
  const d = t.propertyDetail;
  switch (fix) {
    case "records":
      return t.dataCheck.goTo(d.sectionRecords);
    case "financing":
      return t.dataCheck.goTo(d.sectionFinancing);
    case "holding":
      return t.dataCheck.goTo(d.sectionHolding);
    case "edit":
      return t.properties.editProperty;
    case "editFunding":
      return t.dataCheck.recordFunding;
    case "assumptions":
      return t.dataCheck.goTo(t.dataCheck.assumptions);
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
