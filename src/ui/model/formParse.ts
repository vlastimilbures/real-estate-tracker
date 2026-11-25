// Pure parse/format helpers for draft strings ⇄ engine types. Kept out of the form
// component file so fast-refresh stays happy and the parsing is unit-testable.
import { D, type Decimal } from "../../lib/money";
import { fmtCzk, fmtDate } from "../../lib/format";
import {
  DATE_FLOOR_YEAR,
  inRange,
  oneDecimalText,
  WHOLE_DIGITS,
  type IntRange,
} from "../../lib/rules";
import {
  calendarDay,
  money,
  rate,
  type IsoDate,
  type Money,
  type Rate,
} from "../../engine";
import type { Dictionary } from "../../i18n";

/** Accept "1 234 567,89" or "1234567.89" → Decimal. */
export function parseDecimal(raw: string): Decimal | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  try {
    return D(cleaned);
  } catch {
    return null;
  }
}

/** An English thousands separator: `450,000`, `1.250`, `1 250,000` (ADR 0140). The group
 *  space is mandatory and the first digit is not 0, so `1000.005` and `0.005` are amounts. */
const THOUSANDS_SHAPE = /^-?[1-9]\d{0,2}(?:\s+\d{3})*[.,]\d{3}$/;

/** Money entry → Money (sign kept; callers decide whether negatives are allowed). A
 *  thousands-shaped entry is refused: read as decimals it is 1000× too small. */
export function parseMoney(raw: string): Money | null {
  if (THOUSANDS_SHAPE.test(raw.trim())) return null;
  const d = parseDecimal(raw);
  return d === null ? null : money(d);
}

/** Percent entry: user types "4.5" (%) → ratio 0.045. */
export function parsePercentToRatio(raw: string): Rate | null {
  const d = parseDecimal(raw);
  return d === null ? null : rate(d.div(100));
}

/** Whole, unsigned, at most 9 digits like CSV import (ADR 0075, DR-078): a longer entry
 *  is rejected instead of becoming Infinity. */
export function parseIntField(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "");
  if (!WHOLE_DIGITS.test(cleaned)) return null;
  return Number(cleaned);
}

/** A size: unsigned, at most 9 whole digits and one decimal place after a comma or a dot
 *  (ADR 0236 §1), counted by value: "54,50" is 54.5. Two or more decimals are refused,
 *  not rounded. */
export function parseSizeField(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d+)?$/.test(cleaned) || !oneDecimalText(cleaned))
    return null;
  return Number(cleaned);
}

/** dd.mm.yyyy → UTC Date (or null). */
export function parseDate(raw: string): IsoDate | null {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const year = Number(yyyy);
  // New dates start on the date floor (lib/rules.ts); earlier is almost certainly a
  // typo (ADR 0149 §5, DR-035, UX-052).
  if (year < DATE_FLOOR_YEAR) return null;
  return calendarDay(year, Number(mm), Number(dd)); // UTC midnight, no roll-over
}

// draft formatters (Decimal/Date → editable string)
/** The stored precision, never rounded or in exponent form: a form saves the record it
 *  shows, so a rounded draft would rewrite an amount nobody touched (ADR 0131, #201). */
export function moneyDraft(d: Decimal | undefined): string {
  return d == null ? "" : d.toFixed();
}
/** A stored ratio as its exact percentage, for the same reason (ADR 0131, #208): the
 *  `times(100)` and the parse's `div(100)` are exact at Decimal precision. */
export function percentDraft(d: Decimal | undefined): string {
  return d == null ? "" : d.times(100).toFixed();
}
export function dateDraft(date: Date | undefined): string {
  return date ? fmtDate(date) : "";
}

// ---- field specs + kind parsing -------------------------------------------

export type FieldKind = "date" | "money" | "pct" | "int" | "size";

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  optional?: boolean;
  suffix?: string;
  help?: string;
  /** Bounds of an `int` or `size` field; a parsed value outside them is invalid. */
  range?: IntRange;
}

/** A row list among a form's fields (the mortgage's events, ADR 0116): its place in the
 *  grid, label and help, and error routing. It is not parsed as text: its value is its
 *  list's (FormLists), typed by `V`. */
export interface ListSpec<V = unknown> {
  name: string;
  label: string;
  kind: "list";
  help?: string;
  /** The list's fixed first row (ADR 0167): another spec's money field shown as the
   *  list's first row, dated by a date field it mirrors read-only. Hide that spec from
   *  the grid while the list shows. */
  lead?: LeadRow;
  /** Type only, never set: the list's parsed value. */
  readonly value?: V;
}

/** A form's spec: a text field or a row list. */
export type FormSpec = FieldSpec | ListSpec;

/** A row list's spec, its value typed `V` (`listSpec<MortgageDraw[]>()({ ... })`). */
export function listSpec<V>() {
  return <const S extends Omit<ListSpec, "kind" | "value">>(
    spec: S,
  ): S & { kind: "list"; readonly value?: V } => ({ ...spec, kind: "list" });
}

/** A text field's spec, not a row list's. */
export const isFieldSpec = (spec: FormSpec): spec is FieldSpec =>
  spec.kind !== "list";

export interface LeadRow {
  field: string;
  dateField: string;
  label: string;
  /** Shown in place of the date while the date field is blank. */
  dateFallback: string;
}

/** Row lists a form keeps beside its text fields (the mortgage's events, ADR 0116). Their
 *  specs stay in the form's specs, for grid order, label, help and error routing; their
 *  values are the lists'. */
export interface FormLists<L> {
  /** Each list's text for the unsaved check, keyed by name. */
  texts(lists: L): Record<string, string>;
  /** The lists' values keyed by name, or an error per list that does not parse. */
  parse(
    lists: L,
    t: Pick<Dictionary, "forms">,
  ): { values: Record<string, unknown>; errors: Record<string, string> };
  /** The row of an engine error's `index` in list `field`, or null. */
  rowOf(lists: L, field: string, index: number): number | null;
}

/** The fields a form shows for this draft: the specs not hidden, and the field a shown
 *  row list shows as its first row (ADR 0167). A save error on any other field goes
 *  above the buttons (ADR 0243). */
export function shownFields(
  specs: readonly FormSpec[],
  hidden: readonly string[],
): string[] {
  const shown = specs.filter((s) => !hidden.includes(s.name));
  return [
    ...shown.map((s) => s.name),
    ...shown.flatMap((s) =>
      s.kind === "list" && s.lead ? [s.lead.field] : [],
    ),
  ];
}

/** The message for a value that does not parse: the expected format of its kind (UX-040). */
export function invalidHint(
  t: Pick<Dictionary, "forms">,
  kind: FieldKind,
): string {
  return t.forms.invalidHint[kind];
}

/** "Must be a whole number from 1 to 10 000" (UX-068, ADR 0259). */
export function intRangeHint(
  t: Pick<Dictionary, "forms">,
  r: IntRange,
): string {
  const n = (v: number) => fmtCzk(v, { suffix: false });
  return t.forms.intRange(n(r.min), n(r.max));
}

/** "Must be a number from 1 to 10 000 with at most one decimal place" (ADR 0236 §1). */
function sizeRangeHint(t: Pick<Dictionary, "forms">, r: IntRange): string {
  const n = (v: number) => fmtCzk(v, { suffix: false });
  return t.forms.sizeRange(n(r.min), n(r.max));
}

/** A field's invalid-value message: its range when bounded, else its kind's format. */
export function fieldHint(
  t: Pick<Dictionary, "forms">,
  spec: Pick<FieldSpec, "kind" | "range">,
): string {
  if (!spec.range) return invalidHint(t, spec.kind);
  return spec.kind === "size"
    ? sizeRangeHint(t, spec.range)
    : intRangeHint(t, spec.range);
}

/** The value each field kind parses to. */
export interface KindValue {
  date: IsoDate;
  money: Money;
  pct: Rate;
  int: number;
  size: number;
}

/** Any one parsed field value; null = an optional field left blank. */
export type ParsedValue = KindValue[FieldKind] | null;

/** One spec's parsed value: its kind's type, plus null when the spec has an `optional`
 *  flag that is not literally false (a plain FieldSpec may be optional, so it gets null).
 *  A row list's is its list's value, or null for no rows. */
type SpecValue<F extends FormSpec> =
  F extends ListSpec<infer V>
    ? V | null
    : F extends FieldSpec
      ? | KindValue[F["kind"]]
        | ("optional" extends keyof F
            ? F extends { optional: false }
              ? never
              : null
            : never)
      : never;

/** A form's parsed values, keyed and typed by its specs. Declare the specs inline (or
 *  `as const`) so their names, kinds and `optional: true` stay literal. */
export type ParsedValues<S extends readonly FormSpec[]> = {
  [F in S[number] as F["name"]]: SpecValue<F>;
};

/** A parser per field kind: the value, or null when the text does not parse. */
export type KindParsers = {
  [K in FieldKind]: (raw: string) => KindValue[K] | null;
};

/** How a form parses: its kind parsers and the messages for blank and invalid fields. */
export interface CollectRules {
  parsers: KindParsers;
  /** Message for a required field left blank (optional blanks parse to null). */
  blank: (spec: FieldSpec) => string;
  /** Message for text that does not parse as the field's kind. */
  invalid: (spec: FieldSpec) => string;
}

/**
 * Parse a draft (field name → text) into values typed by the specs. Text is trimmed; a
 * blank optional field is null; any blank required or unparseable field gets an error
 * instead of a value.
 */
export function collectValues<const S extends readonly FieldSpec[]>(
  specs: S,
  draft: Readonly<Record<string, string>>,
  rules: CollectRules,
): { values: ParsedValues<S>; errors: Record<string, string> } {
  const values: Record<string, ParsedValue> = {};
  const errors: Record<string, string> = {};
  for (const spec of specs) {
    const raw = (draft[spec.name] ?? "").trim();
    if (raw === "") {
      if (spec.optional) values[spec.name] = null;
      else errors[spec.name] = rules.blank(spec);
      continue;
    }
    const parsed = rules.parsers[spec.kind](raw);
    const outside =
      spec.range && typeof parsed === "number" && !inRange(parsed, spec.range);
    if (parsed === null || outside) errors[spec.name] = rules.invalid(spec);
    else values[spec.name] = parsed;
  }
  // Every value came from its own spec's kind parser, and null only from an optional
  // blank, so the record has the ParsedValues<S> shape (read only when errors is empty).
  return { values: values as ParsedValues<S>, errors };
}

/** The forms' parsers. Money is non-negative everywhere it's entered (price, rent,
 *  principal, instalment, costs), so negatives are rejected here; pct stays signed (a
 *  declining-market appreciation override is legitimately negative). */
export const FORM_PARSERS: KindParsers = {
  date: parseDate,
  money: (raw) => {
    const m = parseMoney(raw);
    return m === null || m.isNegative() ? null : m;
  },
  pct: parsePercentToRatio,
  int: parseIntField,
  size: parseSizeField,
};

/** The forms' shared rules: these parsers, "Required" for a blank required field, and the
 *  field's expected format (or its range) for text that does not parse. */
export function formRules(t: Pick<Dictionary, "forms">): CollectRules {
  return {
    parsers: FORM_PARSERS,
    blank: () => t.forms.required,
    invalid: (spec) => fieldHint(t, spec),
  };
}
