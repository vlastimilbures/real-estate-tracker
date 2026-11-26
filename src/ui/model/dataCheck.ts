// Pure model for the Data check (ADR 0118): the inputs behind a property's numbers
// that are stale, missing or left at a portfolio default, at an explicit as-of date. It
// calls the engine's own selectors, so a finding appears exactly when the engine falls back.
import {
  basisDate,
  edate,
  instalmentBelowInterest,
  leaseEndWithoutFollowOn,
  leaseInForce,
  monthsBetween,
  overlappingLeases,
  renewedLease,
  selectValuation,
} from "../../engine";
import type {
  HoldingCost,
  IsoDate,
  Lease,
  Money,
  MortgageBlock,
  Portfolio,
  Property,
  InstalmentCode,
  Rate,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import type { Decimal } from "../../lib/money";
import { fmtCzk, fmtDate, fmtNumber, fmtPct } from "../../lib/format";
import { inRange, rangeProblems, type IntRange } from "../../lib/rules";
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
  /** No valuation recorded: the purchase price, grown since `purchaseDate`, stands in as
   *  the market value (ADR 0122, ADR 0181). */
  | {
      kind: "noValuation";
      purchasePrice: Money;
      purchaseDate: IsoDate;
      asOf: Date;
    }
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
  /** A stored bounded value outside the range the forms accept (ADR 0148), or finer than
   *  they accept — not a whole number (ADR 0180 §2), or a size with two or more decimals
   *  (ADR 0236 §3): a stored database may hold it, and a restore asks about it.
   *  `loanStart` names the mortgage. */
  | {
      kind: "outOfRange";
      field: "sizeM2" | "fixationYears" | "loanTermYears" | "horizonYears";
      value: number;
      range: IntRange;
      loanStart?: IsoDate;
    }
  /** Two stored leases of the property that overlap (ADR 0163), by start date: a
   *  database from before the rule keeps them. */
  | { kind: "leaseOverlap"; first: IsoDate; second: IsoDate }
  /** A stored plain loan with a term whose instalment is at or below its first month's
   *  interest (ADR 0264): a database from before the rule keeps it, and its figures
   *  leave the unpaid interest out until the next rate reset. `code` is the rule it
   *  breaks: ZERO_RATE_ZERO_INSTALMENT for a 0 % loan with a 0 Kč instalment. */
  | {
      kind: "instalmentBelowInterest";
      code: InstalmentCode;
      loanStart: IsoDate;
      instalment: Money;
      interest: Decimal;
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

/** The page title's review pill: the attention count, named by the full sentence, or
 *  none (ADR 0218 §1, 0223 §5). Each page says where its pill goes. */
export function reviewPill(
  t: Dictionary,
  count: number,
  onSelect: () => void,
): { count: number; label: string; onSelect: () => void } | undefined {
  return count > 0
    ? { count, label: t.dataCheck.reviewPill(count), onSelect }
    : undefined;
}

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
  const stored = [
    ...rangeFindings(property, own(portfolio.mortgages)),
    ...leaseOverlapFindings(own(portfolio.leases)),
    ...instalmentFindings(own(portfolio.mortgages)),
  ];
  if (property.purchaseDate.getTime() > asOf.getTime())
    return { attention: stored, defaults: fundingOf(property, baseDate) };
  const attention: DataFinding[] = [];

  const valuation = selectValuation(own(portfolio.valuations), asOf);
  if (!valuation)
    attention.push({
      kind: "noValuation",
      purchasePrice: property.purchasePrice,
      purchaseDate: property.purchaseDate,
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
  attention.push(...stored);

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
  return rangeProblems({ properties: [property], mortgages }).map(
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

/** Stored leases that overlap (ADR 0163): the forms and the CSV import refuse them, but
 *  a database written before the rule may still hold them. One finding per pair. */
function leaseOverlapFindings(leases: Lease[]): DataFinding[] {
  return overlappingLeases(leases).map(([a, b]) => ({
    kind: "leaseOverlap",
    first: a.startDate,
    second: b.startDate,
  }));
}

/** Stored loans with a term that pay at or below their first month's interest (ADR 0264):
 *  every such block, a replaced past one too, as the forms refuse to save any of them. */
function instalmentFindings(mortgages: MortgageBlock[]): DataFinding[] {
  return mortgages.flatMap((b) => {
    const found = instalmentBelowInterest(b);
    return found
      ? [
          {
            kind: "instalmentBelowInterest" as const,
            code: found.code,
            loanStart: b.startDate,
            instalment: b.monthlyInstalment,
            interest: found.firstInterest,
          },
        ]
      : [];
  });
}

/** The portfolio's own findings, as rows without a property: a stored projection horizon
 *  outside the form range (ADR 0148). A stored base date is not checked (ADR 0232). */
export function portfolioDataCheck(assumptions: {
  horizonYears: number;
  baseDate: Date;
}): DataCheckItem[] {
  const findings: DataFinding[] = [
    ...rangeProblems({ properties: [], mortgages: [] }, assumptions).map(
      ({ field, value, range }): DataFinding => ({
        kind: "outOfRange",
        field,
        value,
        range,
      }),
    ),
  ];
  return findings.map((finding) => ({ propertyId: null, name: null, finding }));
}

/** No own cash recorded: a record with only costs, works or a note counts too. */
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

/** The Dashboard's findings (ADR 0118, ADR 0206): the active properties in view, with
 *  the portfolio's own rows first in "needs attention" (ADR 0148). */
export function dashboardDataCheck(
  portfolio: Portfolio,
  asOf: Date,
  baseDate: Date,
  horizonYears: number,
): { attention: DataCheckItem[]; defaults: DataCheckItem[] } {
  // Inactive properties are left out, as from the Dashboard's totals.
  const items = dataCheckItems(
    portfolio.properties.filter((p) => p.active),
    portfolio,
    asOf,
    baseDate,
  );
  return {
    attention: [
      ...portfolioDataCheck({ horizonYears, baseDate }),
      ...items.attention,
    ],
    defaults: items.defaults,
  };
}

/** One property's place in a grouped line: the chip that links to its fix. A portfolio
 *  row has no property (`propertyId` and `name` null). */
export interface DataCheckChip {
  propertyId: string | null;
  name: string | null;
  /** This property's part of the problem (an age, a date), or null when the line says
   *  it all. */
  detail: string | null;
  fix: DataCheckFix;
}

/** One line of the grouped Data check: the problem and its effect once, then a chip per
 *  affected property (ADR 0206 §4). */
export interface DataCheckGroup {
  kind: DataFinding["kind"];
  headline: string;
  chips: DataCheckChip[];
}

/** A finding as a shared line and its property's detail: the kinds whose sentence holds
 *  a per-property value get a line of their own and the value on the chip; every other
 *  finding keeps its sentence, which equal findings share. */
function findingLine(
  t: Pick<Dictionary, "dataCheck" | "propertyDetail">,
  f: DataFinding,
  resetRate: Rate,
): { headline: string; detail: string | null } {
  const d = t.dataCheck;
  switch (f.kind) {
    case "valuationStale":
      return {
        headline: d.valuationStaleGroup(
          fmtNumber(VALUATION_STALE_MONTHS),
          VALUATION_STALE_MONTHS,
        ),
        detail: `${t.propertyDetail.monthsCount(f.months)} · ${fmtDate(f.validFrom)}`,
      };
    case "noValuation":
      return {
        headline: d.noValuationGroup,
        detail: `${fmtCzk(f.purchasePrice)} · ${fmtDate(f.purchaseDate)}`,
      };
    case "leaseEnded":
      return { headline: d.leaseEndedGroup, detail: fmtDate(f.endDate) };
    case "leaseEnding":
      return {
        headline: d.leaseEndingGroup(
          fmtNumber(LEASE_ENDING_MONTHS),
          LEASE_ENDING_MONTHS,
        ),
        detail: fmtDate(f.endDate),
      };
    case "fixationEnded":
      if (!f.until)
        return {
          headline: d.fixationEndedGroup(fmtPct(resetRate)),
          detail: fmtDate(f.fixationEnd),
        };
      break;
    default:
      break;
  }
  return { headline: findingText(t, f, resetRate), detail: null };
}

/** The list's findings grouped by problem, in the order each problem first appears, so
 *  portfolio rows stay first (ADR 0206 §4). */
export function dataCheckGroups(
  t: Pick<Dictionary, "dataCheck" | "propertyDetail">,
  items: readonly DataCheckItem[],
  resetRate: Rate,
): DataCheckGroup[] {
  const groups = new Map<string, DataCheckGroup>();
  for (const { propertyId, name, finding } of items) {
    const { headline, detail } = findingLine(t, finding, resetRate);
    const key = `${finding.kind}\u0000${headline}`;
    let g = groups.get(key);
    if (!g) {
      g = { kind: finding.kind, headline, chips: [] };
      groups.set(key, g);
    }
    g.chips.push({ propertyId, name, detail, fix: findingFix(finding) });
  }
  return [...groups.values()];
}

type FindingKind = DataFinding["kind"];
type FindingOf<K extends FindingKind> = Extract<DataFinding, { kind: K }>;
type OutOfRange = FindingOf<"outOfRange">;

/** Where each kind of finding is fixed; an out-of-range value by its field. */
const FINDING_FIX: Record<Exclude<FindingKind, "outOfRange">, DataCheckFix> = {
  valuationStale: "records",
  noValuation: "records",
  noLease: "records",
  leaseEnded: "records",
  leaseEnding: "records",
  leaseOverlap: "records",
  fixationEnded: "financing",
  instalmentBelowInterest: "financing",
  costDefaults: "holding",
  growthDefault: "edit",
  fundingUnknown: "editFunding",
};
const OUT_OF_RANGE_FIX: Record<OutOfRange["field"], DataCheckFix> = {
  sizeM2: "edit",
  fixationYears: "financing",
  loanTermYears: "financing",
  horizonYears: "assumptions",
};

/** Where the finding is fixed. */
export function findingFix(f: DataFinding): DataCheckFix {
  return f.kind === "outOfRange"
    ? OUT_OF_RANGE_FIX[f.field]
    : FINDING_FIX[f.kind];
}

type TextDict = Pick<Dictionary, "dataCheck" | "propertyDetail">;

/** A stored value outside the form range, with every decimal (ADR 0180 §2). */
function outOfRangeText(t: TextDict, f: OutOfRange): string {
  const d = t.dataCheck;
  const value = fmtNumber(f.value);
  const range = `${fmtNumber(f.range.min)}–${fmtNumber(f.range.max)}`;
  const loan = f.loanStart ? fmtDate(f.loanStart) : "";
  switch (f.field) {
    case "sizeM2":
      // Only the size can hold a fraction: the engine refuses one in the others
      // (engine/validate/, whole years), so they never reach the Data check. Inside the
      // range it is listed only with two or more decimals (ADR 0236 §3).
      return inRange(f.value, f.range)
        ? d.sizeDecimals(value, range)
        : d.outOfRangeSize(value, range);
    case "fixationYears":
      return d.outOfRangeFixation(loan, value, range, f.value);
    case "loanTermYears":
      return d.outOfRangeTerm(loan, value, range, f.value);
    case "horizonYears":
      return d.outOfRangeHorizon(value, range, f.value);
  }
}

/** A stored loan below its interest, worded by the rule it breaks (ADR 0264): every
 *  instalment code needs its sentence. */
const INSTALMENT_TEXT: Record<
  InstalmentCode,
  (t: TextDict, f: FindingOf<"instalmentBelowInterest">) => string
> = {
  INSTALMENT_BELOW_INTEREST: (t, f) =>
    t.dataCheck.instalmentBelowInterest(
      fmtDate(f.loanStart),
      fmtCzk(f.instalment),
      fmtCzk(f.interest),
    ),
  ZERO_RATE_ZERO_INSTALMENT: (t, f) =>
    t.dataCheck.zeroRateZeroInstalment(fmtDate(f.loanStart)),
};

/** Each kind of finding's sentence. */
const FINDING_TEXT: {
  [K in FindingKind]: (t: TextDict, f: FindingOf<K>, resetRate: Rate) => string;
} = {
  valuationStale: (t, f) =>
    t.dataCheck.valuationStale(
      t.propertyDetail.monthsCount(f.months),
      fmtDate(f.validFrom),
    ),
  noValuation: (t, f) =>
    t.dataCheck.noValuation(fmtCzk(f.purchasePrice), fmtDate(f.purchaseDate)),
  noLease: (t, f) => t.dataCheck.noLease(fmtDate(f.asOf)),
  leaseEnded: (t, f) => t.dataCheck.leaseEnded(fmtDate(f.endDate)),
  leaseEnding: (t, f) => t.dataCheck.leaseEnding(fmtDate(f.endDate)),
  leaseOverlap: (t, f) =>
    t.dataCheck.leaseOverlap(fmtDate(f.first), fmtDate(f.second)),
  fixationEnded: (t, f, resetRate) => loanWarningText(t, f, resetRate),
  instalmentBelowInterest: (t, f) => INSTALMENT_TEXT[f.code](t, f),
  growthDefault: ({ dataCheck: d }, f) =>
    f.appreciation && f.rentIndexation
      ? d.growthBoth
      : f.appreciation
        ? d.growthAppreciation
        : d.growthRentIndexation,
  costDefaults: (t, f) =>
    t.dataCheck.costDefaults(
      f.fields.map((field) => costLabel(t, field)).join(", "),
    ),
  fundingUnknown: ({ dataCheck: d }, f) =>
    f.future ? d.fundingUnknownFuture : d.fundingUnknown,
  outOfRange: outOfRangeText,
};

/** The finding and its effect as one or two sentences in the user's language. */
export function findingText<K extends FindingKind>(
  t: TextDict,
  f: FindingOf<K>,
  resetRate: Rate,
): string {
  // The table's type pairs each kind with its finding; `f.kind` is that kind.
  return FINDING_TEXT[f.kind as K](t, f, resetRate);
}

/** The fix link's label: the section it moves to, or the property form. */
export function fixLabel(
  t: Pick<
    Dictionary,
    "dataCheck" | "propertyDetail" | "properties" | "settings"
  >,
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
      return t.dataCheck.goTo(t.settings.tabs.assumptions);
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
