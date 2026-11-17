// What a CSV row changes on the stored row it matches (ADR 0096): the import plan's diff.
import type { FieldChange, ImportKind } from "./csvImport";
import { PLAIN_DECIMAL } from "../lib/decimalText";
import { D } from "../lib/money";

/** Stored text of a cell value; empty ⇒ `null`. */
function cellText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

/** Equal for the user: both empty, the same decimal value, or the same text. */
function sameValue(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  if (PLAIN_DECIMAL.test(a) && PLAIN_DECIMAL.test(b)) return D(a).eq(D(b));
  return a === b;
}

/** The CSV columns whose value would change on `stored`. */
export function changesOf(stored: object, fields: object): FieldChange[] {
  const row = stored as Record<string, unknown>;
  const out: FieldChange[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const before = cellText(row[field]);
    const after = cellText(value);
    if (!sameValue(before, after)) out.push({ field, before, after });
  }
  return out;
}

export const kindOf = (
  existing: unknown,
  changes: FieldChange[],
): ImportKind =>
  !existing ? "add" : changes.length > 0 ? "update" : "unchanged";
