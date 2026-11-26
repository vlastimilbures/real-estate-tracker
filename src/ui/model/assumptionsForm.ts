// The Assumptions form's fields, its text draft and the check before a save (ADR 0095,
// 0075). Pure, so the form's hook holds only its state.
import {
  collectValues,
  fieldHint,
  percentDraft,
  moneyDraft,
  dateDraft,
  FORM_PARSERS,
  type CollectRules,
} from "./formParse";
import { INT_RANGES } from "../../lib/rules";
import type { Assumptions } from "../../engine";
import { CZK } from "../../lib/format";
import { type Dictionary } from "../../i18n";

/** The form's fields: the projection drivers, then the holding-cost defaults. */
export function assumptionSpecs(t: Pick<Dictionary, "assumptions" | "common">) {
  const a = t.assumptions;
  return {
    drivers: [
      {
        name: "baseDate",
        label: a.baseDate,
        kind: "date",
        help: a.baseDateHelp,
      },
      {
        name: "horizonYears",
        label: a.horizon,
        kind: "int",
        suffix: t.common.yearsSuffix,
        range: INT_RANGES.horizonYears,
      },
      {
        name: "appreciationPa",
        label: a.appreciation,
        kind: "pct",
        suffix: "%",
      },
      {
        name: "rentIndexationPa",
        label: a.rentIndexation,
        kind: "pct",
        suffix: "%",
      },
      { name: "inflationPa", label: a.inflation, kind: "pct", suffix: "%" },
      { name: "vacancyAllowance", label: a.vacancy, kind: "pct", suffix: "%" },
      {
        name: "postFixationResetRatePa",
        label: a.postFixationReset,
        kind: "pct",
        suffix: "%",
      },
      {
        name: "sellingCostPct",
        label: a.sellingCost,
        kind: "pct",
        suffix: "%",
        help: a.sellingCostHelp,
      },
    ],
    defaults: [
      {
        name: "propertyTaxYr",
        label: a.propertyTax,
        kind: "money",
        suffix: CZK.symbol,
      },
      {
        name: "insuranceYr",
        label: a.insurance,
        kind: "money",
        suffix: CZK.symbol,
      },
      {
        name: "svjMonthly",
        label: a.svj,
        kind: "money",
        suffix: CZK.symbol,
      },
      {
        name: "otherYr",
        label: a.other,
        kind: "money",
        suffix: CZK.symbol,
      },
      { name: "mgmtPctRent", label: a.mgmt, kind: "pct", suffix: "%" },
      { name: "maintPctRent", label: a.maint, kind: "pct", suffix: "%" },
    ],
  } as const;
}

/** Every field is required; money defaults are 0 or more, as in RecordForm (ADR 0075). */
function assumptionRules(t: Dictionary): CollectRules {
  return {
    parsers: FORM_PARSERS,
    blank: (spec) => fieldHint(t, spec),
    invalid: (spec) => fieldHint(t, spec),
  };
}

/** The stored assumptions as the form's text draft. */
export function assumptionsDraft(a: Assumptions): Record<string, string> {
  return {
    baseDate: dateDraft(a.baseDate),
    horizonYears: String(a.horizonYears),
    appreciationPa: percentDraft(a.appreciationPa),
    rentIndexationPa: percentDraft(a.rentIndexationPa),
    inflationPa: percentDraft(a.inflationPa),
    vacancyAllowance: percentDraft(a.vacancyAllowance),
    postFixationResetRatePa: percentDraft(a.postFixationResetRatePa),
    sellingCostPct: percentDraft(a.sellingCostPct),
    propertyTaxYr: moneyDraft(a.defaults.propertyTaxYr),
    insuranceYr: moneyDraft(a.defaults.insuranceYr),
    svjMonthly: moneyDraft(a.defaults.svjMonthly),
    otherYr: moneyDraft(a.defaults.otherYr),
    mgmtPctRent: percentDraft(a.defaults.mgmtPctRent),
    maintPctRent: percentDraft(a.defaults.maintPctRent),
  };
}

/** The draft's values as Assumptions, or the field errors that stop the save. */
export function checkAssumptionsDraft(
  t: Dictionary,
  draftShown: Record<string, string>,
) {
  const { drivers, defaults } = assumptionSpecs(t);
  const { values: v, errors: errs } = collectValues(
    [...drivers, ...defaults],
    draftShown,
    assumptionRules(t),
  );
  if (Object.keys(errs).length > 0) return { ok: false as const, errors: errs };
  const next: Assumptions = {
    baseDate: v.baseDate,
    horizonYears: v.horizonYears,
    appreciationPa: v.appreciationPa,
    rentIndexationPa: v.rentIndexationPa,
    inflationPa: v.inflationPa,
    vacancyAllowance: v.vacancyAllowance,
    postFixationResetRatePa: v.postFixationResetRatePa,
    sellingCostPct: v.sellingCostPct,
    defaults: {
      propertyTaxYr: v.propertyTaxYr,
      insuranceYr: v.insuranceYr,
      svjMonthly: v.svjMonthly,
      otherYr: v.otherYr,
      mgmtPctRent: v.mgmtPctRent,
      maintPctRent: v.maintPctRent,
    },
  };
  return { ok: true as const, values: next };
}
