// Whole-number field bounds (ADR 0075, DR-078), shared by the forms (src/ui/model) and
// CSV import (src/import, ADR 0076) so both refuse the same values.

/** Inclusive bounds of a whole-number field. */
export interface IntRange {
  min: number;
  max: number;
}

/** The whole-number field bounds (ADR 0075, DR-078). */
export const INT_RANGES = {
  horizonYears: { min: 1, max: 100 },
  fixationYears: { min: 0, max: 50 },
  loanTermYears: { min: 1, max: 50 },
  sizeM2: { min: 1, max: 10_000 },
} as const satisfies Record<string, IntRange>;

export const inRange = (n: number, r: IntRange): boolean =>
  n >= r.min && n <= r.max;

/** Above this many times a field's form maximum a stored value is not plausible data but
 *  a broken file: restore refuses it, where up to it restore only asks (ADR 0148). It also
 *  keeps a hand-edited horizon or term from making every projection loop for ever. */
export const HARD_LIMIT_FACTOR = 10;

/** A bounded whole-number field and where it is stored. */
export type BoundedField = keyof typeof INT_RANGES;

/** One stored whole-number value outside INT_RANGES. */
export interface OutOfRangeField {
  entity: "assumptions" | "property" | "mortgage";
  id: string | undefined;
  field: BoundedField;
  value: number;
  range: IntRange;
  /** Above HARD_LIMIT_FACTOR × the form maximum. */
  beyondLimit: boolean;
}

/** Every bounded whole-number field outside INT_RANGES (unset optional fields pass).
 *  Structural types: lib never imports the engine, whose Portfolio and Assumptions fit. */
export function outOfRangeFields(
  portfolio: {
    properties: readonly { id: string; sizeM2?: number | undefined }[];
    mortgages: readonly {
      id: string;
      fixationYears: number;
      loanTermYears?: number | undefined;
    }[];
  },
  assumptions?: { horizonYears: number },
): OutOfRangeField[] {
  const out: OutOfRangeField[] = [];
  const check = (
    entity: OutOfRangeField["entity"],
    id: string | undefined,
    field: BoundedField,
    value: number | undefined,
  ) => {
    const range = INT_RANGES[field];
    if (value !== undefined && !inRange(value, range))
      out.push({
        entity,
        id,
        field,
        value,
        range,
        beyondLimit: value > range.max * HARD_LIMIT_FACTOR,
      });
  };
  if (assumptions)
    check("assumptions", undefined, "horizonYears", assumptions.horizonYears);
  for (const p of portfolio.properties)
    check("property", p.id, "sizeM2", p.sizeM2);
  for (const m of portfolio.mortgages) {
    check("mortgage", m.id, "fixationYears", m.fixationYears);
    check("mortgage", m.id, "loanTermYears", m.loanTermYears);
  }
  return out;
}
