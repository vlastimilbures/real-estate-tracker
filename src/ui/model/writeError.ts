// Translated text for a failed write (DR-133): which message to show and, when one form
// field is at fault, which field to show it on. Pure; the store hands over a WriteError.
import type { Dictionary } from "../../i18n";
import type { EngineValidationError, ValidationCode } from "../../engine";
import type { ConstraintFailure } from "../../data/errors";
import type { WriteError, WriteRangeProblem } from "../../state/writeError";
import { fieldHint } from "./formParse";
import { inputRuleText } from "./inputRule";
import { CHECK_CONSTRAINTS } from "../../lib/checkConstraints";

/** An input error whose field may be a form's own key, not only an engine field: the
 *  scenario form names a shock rule by its form field (ADR 0251 §4). */
type FormFieldError = Omit<EngineValidationError, "field"> & {
  field?: string | undefined;
};

/** A failed write as a form shows it: every WriteError is one. */
export type FormWriteError =
  | Exclude<WriteError, { kind: "input" }>
  | (Omit<Extract<WriteError, { kind: "input" }>, "errors"> & {
      errors: readonly FormFieldError[];
    });

export interface WriteErrorText {
  message: string;
  /** Form field (spec name) the message belongs to, when it is one field. */
  field?: string | undefined;
  /** The item of a list field (prepayments, recasts) it belongs to (ADR 0116). */
  index?: number | undefined;
}

/** CHECK constraint → engine rule wording + the field it guards, named like the engine
 *  field. One list for the schema and this map (src/lib/checkConstraints.ts, #470). */
const CHECKS: Record<
  string,
  { rule: ValidationCode | "flag" | "json"; field?: string }
> = Object.fromEntries(CHECK_CONSTRAINTS.map((c) => [c.name, c]));

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
            : inputRuleText(t, known.rule);
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

/** The base field a scenario's shock shifts (ADR 0128 §6): an assumptions edit that
 *  breaks a saved scenario shows on the level it changed. */
const SHIFTED_LEVEL: Record<string, string> = {
  rateShock: "postFixationResetRatePa",
  inflationShock: "inflationPa",
};

/** Out-of-range values the store refused (ADR 0245): the form's own range message
 *  (`forms.intRange`, `forms.sizeRange`) on the form's own field, which every form names
 *  like the bounded field (horizonYears, fixationYears, loanTermYears, sizeM2) and the
 *  scenario form like its years fields (ADR 0257 §1). */
function rangeTexts(
  t: Dictionary,
  ranges: readonly WriteRangeProblem[] | undefined,
): WriteErrorText[] {
  return (ranges ?? []).map((r) => ({
    message: fieldHint(t, {
      kind: r.field === "sizeM2" ? "size" : "int",
      range: r.range,
    }),
    field: r.field,
  }));
}

/** One text per problem (an input error can break several rules at once), without
 *  repeats. */
export function writeErrorTexts(
  t: Dictionary,
  e: FormWriteError,
): WriteErrorText[] {
  if (e.kind !== "input") return [describeWriteError(t, e)];
  const seen = new Set<string>();
  const out: WriteErrorText[] = [];
  const { scenario } = e;
  for (const err of e.errors) {
    const rule = inputRuleText(t, err.code);
    const message =
      scenario === undefined
        ? rule
        : t.writeErrors.scenarioBreaks(scenario, rule);
    const field =
      scenario === undefined
        ? formField(err.field)
        : SHIFTED_LEVEL[err.field ?? ""];
    const key = `${field ?? ""}|${err.index ?? ""}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Field and index only when present (tests compare whole objects).
    out.push({
      message,
      ...(field && { field }),
      ...(field && err.index !== undefined && { index: err.index }),
    });
  }
  return [...out, ...rangeTexts(t, e.ranges)];
}

/** A form's own key for a failure's field (and list item): where the form shows it, or
 *  null when it shows it above the buttons (ADR 0261, #440). Each form declares one. */
export type ErrorField = (field: string, index?: number) => string | null;

/** The ErrorField of a form that shows `fields` under their own names. An error on a list
 *  item is keyed `field.row` when `rowOf` finds the form row it came from (ADR 0116). */
export function fieldsIn(
  fields: readonly string[],
  rowOf?: (field: string, index: number) => number | null,
): ErrorField {
  return (field, index) => {
    if (!fields.includes(field)) return null;
    const row = index === undefined ? null : (rowOf?.(field, index) ?? null);
    return row === null ? field : `${field}.${row}`;
  };
}

/**
 * Split a failure for a form: messages on the keys its `errorField` names (first message
 * per key), and one line for the rest, shown above the buttons.
 */
export function formWriteErrors(
  t: Dictionary,
  e: FormWriteError,
  errorField: ErrorField,
): { fieldErrors: Record<string, string>; formError: string | null } {
  const fieldErrors: Record<string, string> = {};
  const rest: string[] = [];
  for (const text of writeErrorTexts(t, e)) {
    const key = text.field ? errorField(text.field, text.index) : null;
    if (key === null) rest.push(text.message);
    else fieldErrors[key] ??= text.message;
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
        // One line per message: two list items breaking one rule read once.
        message: [...new Set(texts.map((x) => x.message))].join(" · "),
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
