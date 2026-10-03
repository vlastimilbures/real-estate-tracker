// The ErrorBoundary's text for stored data that breaks an engine rule (UX-049, DR-119):
// one line per problem naming the property (or the assumptions) and the rule, plus the
// property to open. Pure.
import type { Dictionary } from "../../i18n";
import type { EngineValidationError, Portfolio } from "../../engine";

export interface InvalidDataLine {
  text: string;
  propertyId?: string;
}

/** The property a validation error's row belongs to, if any. */
function propertyOf(
  e: EngineValidationError,
  p: Portfolio | null,
): string | undefined {
  if (!e.id || !p) return undefined;
  if (e.entity === "property") return e.id;
  const rows =
    e.entity === "mortgage"
      ? p.mortgages
      : e.entity === "valuation"
        ? p.valuations
        : e.entity === "lease"
          ? p.leases
          : e.entity === "holdingCost"
            ? p.holdingCosts
            : [];
  return rows.find((r) => r.id === e.id)?.propertyId;
}

export function invalidDataLines(
  t: Dictionary,
  errors: readonly EngineValidationError[],
  portfolio: Portfolio | null,
): InvalidDataLine[] {
  const seen = new Set<string>();
  const lines: InvalidDataLine[] = [];
  for (const e of errors) {
    const propertyId = propertyOf(e, portfolio);
    const name =
      e.entity === "assumptions"
        ? t.errorBoundary.assumptionsRecord
        : (portfolio?.properties.find((x) => x.id === propertyId)?.name ??
          t.errorBoundary.unknownRecord);
    const text = `${name}: ${t.inputRules[e.code]}`;
    if (seen.has(text)) continue;
    seen.add(text);
    lines.push(propertyId ? { text, propertyId } : { text });
  }
  return lines;
}
