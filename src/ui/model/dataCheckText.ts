// The Data check's words (ADR 0118, ADR 0206): each finding's sentence, the grouped lines
// of the Dashboard's list and the fix links' labels. The findings come from dataCheck.ts.
import type { InstalmentCode, Rate } from "../../engine";
import type { Dictionary } from "../../i18n";
import { fmtCzk, fmtDate, fmtNumber, fmtPct } from "../../lib/format";
import { inRange } from "../../lib/rules";
import {
  LEASE_ENDING_MONTHS,
  VALUATION_STALE_MONTHS,
  findingFix,
  type CostField,
  type DataCheckFix,
  type DataCheckItem,
  type DataFinding,
  type FindingKind,
  type FindingOf,
  type OutOfRange,
} from "./dataCheck";
import { loanWarningText } from "./propertyDetail";

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
