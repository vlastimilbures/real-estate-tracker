// The rules for matching property names (ADR 0049), shared by CSV import (src/import),
// the property form (src/ui/model) and backup restore (src/data), which cannot import
// each other.

/** A property name as it is matched: in one Unicode form (NFC, ADR 0237), trimmed,
 *  case-insensitive. */
export function propertyKey(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}

/** A property name as it is spelled: trimmed and case-insensitive, without the NFC step
 *  (ADR 0049). Restore's duplicate check compares this, so a backup the app accepted
 *  before ADR 0237 still restores; CSV matching tries it first, so a row spelled like one
 *  of two stored names that differ only in Unicode form lands on that one (ADR 0237
 *  Consequences). */
export function spellingKey(name: string): string {
  return name.trim().toLowerCase();
}
