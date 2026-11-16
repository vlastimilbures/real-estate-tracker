// The one rule for matching property names (D-55), shared by CSV import (src/import) and
// the property form (src/ui/model). Backup restore keeps its own, older comparison
// (`restoreNameKey` in src/data/backup.ts, ADR 0237 Consequences).

/** A property name as it is matched: in one Unicode form (NFC, ADR 0237), trimmed,
 *  case-insensitive. */
export function propertyKey(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}
