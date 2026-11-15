// The holding costs' read view (ADR 0207): each field's stored value, or the portfolio
// default the engine uses for a blank field (SPEC §4.1). Presentation only.
import type { CostDefaults, HoldingCost } from "../../engine";
import type { Dictionary } from "../../i18n";
import type { Decimal } from "../../lib/money";

export interface HoldingCostRow {
  label: string;
  kind: "money" | "pct";
  value: Decimal;
  /** The field is blank, so the portfolio default applies. */
  isDefault: boolean;
}

const FIELDS = [
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

/** The six costs in the form's order. */
export function holdingCostsView(
  holding: HoldingCost | undefined,
  defaults: CostDefaults,
  t: Pick<Dictionary, "propertyDetail">,
): HoldingCostRow[] {
  return FIELDS.map(([field, label, kind]) => {
    const own = holding?.[field];
    return {
      label: t.propertyDetail[label],
      kind,
      value: own ?? defaults[field],
      isDefault: own === undefined,
    };
  });
}
