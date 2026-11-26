// The holding costs' read view (ADR 0207): each field's stored value, or the portfolio
// default the engine uses for a blank field (SPEC §4.1); and the form's fields, draft and
// the record it saves. Presentation only.
import type { CostDefaults, HoldingCost } from "../../engine";
import type { Dictionary } from "../../i18n";
import { CZK } from "../../lib/format";
import type { Decimal } from "../../lib/money";
import { moneyDraft, percentDraft, type KindValue } from "./formParse";

export interface HoldingCostRow {
  label: string;
  kind: "money" | "pct";
  value: Decimal;
  /** The field is blank, so the portfolio default applies. */
  isDefault: boolean;
}

/** The six holding costs in the form's order: the field, its label and its kind. The
 *  read view, the Data check's cost-defaults finding and its sentence read this list. */
export const COST_FIELDS = [
  ["propertyTaxYr", "fieldPropertyTax", "money"],
  ["insuranceYr", "fieldInsurance", "money"],
  ["svjMonthly", "fieldSvjMo", "money"],
  ["otherYr", "fieldOther", "money"],
  ["mgmtPctRent", "fieldMgmtPct", "pct"],
  ["maintPctRent", "fieldMaintPct", "pct"],
] as const satisfies readonly (readonly [
  keyof CostDefaults,
  keyof Dictionary["propertyDetail"],
  HoldingCostRow["kind"],
])[];

/** A holding-cost field. */
export type CostField = (typeof COST_FIELDS)[number][0];

const COST_LABEL = Object.fromEntries(
  COST_FIELDS.map(([field, label]) => [field, label]),
) as Record<CostField, (typeof COST_FIELDS)[number][1]>;

/** A holding cost's label, as the form and the read view show it. */
export function costFieldLabel(
  t: Pick<Dictionary, "propertyDetail">,
  field: CostField,
): string {
  return t.propertyDetail[COST_LABEL[field]];
}

/** The six costs in the form's order. */
export function holdingCostsView(
  holding: HoldingCost | undefined,
  defaults: CostDefaults,
  t: Pick<Dictionary, "propertyDetail">,
): HoldingCostRow[] {
  return COST_FIELDS.map(([field, label, kind]) => {
    const own = holding?.[field];
    return {
      label: t.propertyDetail[label],
      kind,
      value: own ?? defaults[field],
      isDefault: own === undefined,
    };
  });
}

/** The form's six optional fields, in the read view's order. Typed literally, so the
 *  values are typed by them. */
export function holdingCostSpecs(t: Pick<Dictionary, "propertyDetail">) {
  const d = t.propertyDetail;
  return [
    {
      name: "propertyTaxYr",
      label: d.fieldPropertyTax,
      kind: "money",
      suffix: CZK.symbol,
      optional: true,
    },
    {
      name: "insuranceYr",
      label: d.fieldInsurance,
      kind: "money",
      suffix: CZK.symbol,
      optional: true,
    },
    {
      name: "svjMonthly",
      label: d.fieldSvjMo,
      kind: "money",
      suffix: CZK.symbol,
      optional: true,
    },
    {
      name: "otherYr",
      label: d.fieldOther,
      kind: "money",
      suffix: CZK.symbol,
      optional: true,
    },
    {
      name: "mgmtPctRent",
      label: d.fieldMgmtPct,
      kind: "pct",
      suffix: "%",
      optional: true,
    },
    {
      name: "maintPctRent",
      label: d.fieldMaintPct,
      kind: "pct",
      suffix: "%",
      optional: true,
    },
  ] as const;
}

/** The form's draft: the stored costs, a blank field for one not set. */
export function holdingCostDraft(holding: HoldingCost | undefined) {
  return {
    propertyTaxYr: moneyDraft(holding?.propertyTaxYr),
    insuranceYr: moneyDraft(holding?.insuranceYr),
    svjMonthly: moneyDraft(holding?.svjMonthly),
    otherYr: moneyDraft(holding?.otherYr),
    mgmtPctRent: percentDraft(holding?.mgmtPctRent),
    maintPctRent: percentDraft(holding?.maintPctRent),
  };
}

/** The form's parsed values; a blank field is null. */
export interface HoldingCostFormValues {
  propertyTaxYr: KindValue["money"] | null;
  insuranceYr: KindValue["money"] | null;
  svjMonthly: KindValue["money"] | null;
  otherYr: KindValue["money"] | null;
  mgmtPctRent: KindValue["pct"] | null;
  maintPctRent: KindValue["pct"] | null;
}

/** The record a submitted form saves: the property's existing one by its id, else a new
 *  one under `newId()`; a blank field is unset, so its default applies. */
export function holdingCostFromForm(
  v: HoldingCostFormValues,
  propertyId: string,
  holding: HoldingCost | undefined,
  newId: () => string,
): HoldingCost {
  return {
    id: holding?.id ?? newId(),
    propertyId,
    propertyTaxYr: v.propertyTaxYr ?? undefined,
    insuranceYr: v.insuranceYr ?? undefined,
    svjMonthly: v.svjMonthly ?? undefined,
    otherYr: v.otherYr ?? undefined,
    mgmtPctRent: v.mgmtPctRent ?? undefined,
    maintPctRent: v.maintPctRent ?? undefined,
  };
}
