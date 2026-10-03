// Translated text for a failed write (DR-133): which message to show and, when one form
// field is at fault, which field to show it on. Pure; the store hands over a WriteError.
import type { Dictionary } from "../../i18n";
import type { ValidationCode } from "../../engine";
import type { ConstraintFailure } from "../../data/errors";
import type { WriteError } from "../../state/writeError";

export interface WriteErrorText {
  message: string;
  /** Form field (spec name) the message belongs to, when it is one field. */
  field?: string | undefined;
}

/** CHECK constraint (migrations v7) → engine rule wording + the field it guards, named
 *  like the engine field (the property modal maps these to its snake_case keys). */
const CHECKS: Record<
  string,
  { rule: ValidationCode | "flag" | "json"; field?: string }
> = {
  property_purchase_date_iso: { rule: "INVALID_DATE", field: "purchaseDate" },
  property_purchase_price_not_negative: {
    rule: "NEGATIVE_AMOUNT",
    field: "purchasePrice",
  },
  property_active_flag: { rule: "flag" },
  property_garage_flag: { rule: "flag", field: "garage" },
  mortgage_start_date_iso: { rule: "INVALID_DATE", field: "startDate" },
  mortgage_principal_not_negative: {
    rule: "NEGATIVE_AMOUNT",
    field: "initialPrincipal",
  },
  mortgage_instalment_not_negative: {
    rule: "NEGATIVE_AMOUNT",
    field: "monthlyInstalment",
  },
  mortgage_rate_0_to_1: { rule: "RATE_OUT_OF_RANGE", field: "interestRatePa" },
  mortgage_fixation_whole_years: {
    rule: "INVALID_TERM",
    field: "fixationYears",
  },
  mortgage_term_positive: { rule: "INVALID_TERM", field: "loanTermYears" },
  mortgage_interest_only_until_iso: {
    rule: "INVALID_DATE",
    field: "completionDate",
  },
  mortgage_contract_maturity_iso: { rule: "INVALID_DATE" },
  mortgage_draws_json: { rule: "json", field: "draws" },
  // v9 (ADR 0109): added with their columns, outside the frozen V7_TABLES.
  mortgage_prepayments_json: { rule: "json", field: "prepayments" },
  mortgage_recasts_json: { rule: "json", field: "recasts" },
  valuation_valid_from_iso: { rule: "INVALID_DATE", field: "validFrom" },
  valuation_valid_to_iso: { rule: "INVALID_DATE", field: "validTo" },
  valuation_end_not_before_start: {
    rule: "END_BEFORE_START",
    field: "validTo",
  },
  valuation_value_not_negative: {
    rule: "NEGATIVE_AMOUNT",
    field: "marketValue",
  },
  lease_start_date_iso: { rule: "INVALID_DATE", field: "startDate" },
  lease_end_date_iso: { rule: "INVALID_DATE", field: "endDate" },
  lease_end_not_before_start: { rule: "END_BEFORE_START", field: "endDate" },
  lease_rent_not_negative: { rule: "NEGATIVE_AMOUNT", field: "monthlyRent" },
  assumptions_base_date_iso: { rule: "INVALID_DATE", field: "baseDate" },
  assumptions_horizon_positive: {
    rule: "HORIZON_NOT_POSITIVE",
    field: "horizonYears",
  },
  assumptions_vacancy_0_to_1: {
    rule: "RATE_OUT_OF_RANGE",
    field: "vacancyAllowance",
  },
  assumptions_mgmt_0_to_1: { rule: "RATE_OUT_OF_RANGE", field: "mgmtPctRent" },
  assumptions_maint_0_to_1: {
    rule: "RATE_OUT_OF_RANGE",
    field: "maintPctRent",
  },
  scenario_overrides_json: { rule: "json" },
};

function constraintText(t: Dictionary, c: ConstraintFailure): WriteErrorText {
  const w = t.writeErrors;
  switch (c.kind) {
    case "unique": {
      const key = `${c.table}(${c.columns.join(",")})`;
      if (c.columns.length === 1 && c.columns[0] === "id")
        return { message: w.duplicateId };
      if (key === "properties(name)")
        return { message: w.duplicatePropertyName, field: "name" };
      if (key === "valuations(property_id,valid_from)")
        return { message: w.duplicateValuationDate, field: "validFrom" };
      if (key === "leases(property_id,start_date)")
        return { message: w.duplicateLeaseStart, field: "startDate" };
      if (key === "mortgage_blocks(property_id,start_date)")
        return {
          message: t.inputRules.DUPLICATE_BLOCK_START,
          field: "startDate",
        };
      if (key === "holding_costs(property_id)")
        return { message: t.inputRules.DUPLICATE_HOLDING_COST };
      return { message: w.otherConstraint };
    }
    case "check": {
      const known = CHECKS[c.check];
      if (!known) return { message: w.otherConstraint };
      const message =
        known.rule === "flag"
          ? w.invalidFlag
          : known.rule === "json"
            ? w.invalidJson
            : t.inputRules[known.rule];
      return { message, field: known.field };
    }
    case "foreignKey":
      return { message: t.inputRules.ORPHAN_ROW };
    case "notNull":
      return { message: w.missingValue };
  }
}

/** The form field an engine field names: assumption defaults sit at the top level of
 *  the Assumptions form ("defaults.mgmtPctRent" → "mgmtPctRent"). */
const formField = (field: string | undefined) =>
  field?.replace(/^defaults\./, "");

/** One text per problem (an input error can break several rules at once), without
 *  repeats. */
export function writeErrorTexts(
  t: Dictionary,
  e: WriteError,
): WriteErrorText[] {
  if (e.kind !== "input") return [describeWriteError(t, e)];
  const seen = new Set<string>();
  const out: WriteErrorText[] = [];
  for (const err of e.errors) {
    const text = {
      message: t.inputRules[err.code],
      field: formField(err.field),
    };
    const key = `${text.field ?? ""}|${text.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.field ? text : { message: text.message });
  }
  return out;
}

/**
 * Split a failure for a form: messages for the fields the form shows (first message
 * per field), and one line for the rest, shown above the buttons.
 */
export function formWriteErrors(
  t: Dictionary,
  e: WriteError,
  fields: readonly string[],
): { fieldErrors: Record<string, string>; formError: string | null } {
  const fieldErrors: Record<string, string> = {};
  const rest: string[] = [];
  for (const text of writeErrorTexts(t, e)) {
    if (text.field && fields.includes(text.field)) {
      fieldErrors[text.field] ??= text.message;
    } else rest.push(text.message);
  }
  return { fieldErrors, formError: rest.length ? rest.join(" · ") : null };
}

/** One sentence for the whole failure (banner, startup screen). */
export function describeWriteError(
  t: Dictionary,
  e: WriteError,
): WriteErrorText {
  switch (e.kind) {
    case "input": {
      const texts = writeErrorTexts(t, e);
      return {
        message: texts.map((x) => x.message).join(" · "),
        field: texts[0]?.field,
      };
    }
    case "constraint":
      return constraintText(t, e.constraint);
    case "data":
      return { message: t.dataErrors[e.code] };
    case "other":
      return { message: e.message };
  }
}
