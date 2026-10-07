// The one rule for matching property names (D-55), shared by CSV import (src/import) and
// backup restore (src/data), which cannot import each other.

/** A property name as it is matched: trimmed, case-insensitive. */
export function propertyKey(name: string): string {
  return name.trim().toLowerCase();
}
