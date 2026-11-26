// The ErrorBoundary's text for stored data that breaks an engine rule:
// one line per problem naming the property (or the assumptions) and the rule, plus the
// property to open, and a hint for a leftover mortgage block (ADR 0258). Pure.
import type { Dictionary } from "../../i18n";
import {
  edate,
  type EngineValidationError,
  type MortgageBlock,
  type Portfolio,
} from "../../engine";
import { fmtDate } from "../../lib/format";
import { inputRuleText } from "./inputRule";

export interface InvalidDataLine {
  text: string;
  propertyId?: string;
}

/** The property a validation error's row belongs to, if any. */
function propertyOf(
  e: EngineValidationError,
  p: Portfolio | null,
): string | undefined {
  if (e.id === undefined || !p) return undefined;
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
    const text = `${name}: ${inputRuleText(t, e.code)}`;
    if (seen.has(text)) continue;
    seen.add(text);
    lines.push(propertyId !== undefined ? { text, propertyId } : { text });
  }
  return lines;
}

/** The blocks the engine refused as REFINANCE_WITHIN_A_MONTH, by property, by start. */
function flaggedByProperty(
  errors: readonly EngineValidationError[],
  p: Portfolio,
): [string, MortgageBlock[]][] {
  const ids = new Set(
    errors
      .filter(
        (e) => e.code === "REFINANCE_WITHIN_A_MONTH" && e.entity === "mortgage",
      )
      .map((e) => e.id),
  );
  const byProperty = new Map<string, MortgageBlock[]>();
  for (const b of p.mortgages) {
    if (!ids.has(b.id)) continue;
    byProperty.set(b.propertyId, [...(byProperty.get(b.propertyId) ?? []), b]);
  }
  return [...byProperty].map(([id, own]) => [
    id,
    own.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
  ]);
}

/**
 * One hint per pair of flagged blocks of one property whose later start is on or before
 * EDATE(earlier start, 1): usually one is left over from a corrected start date
 * (ADR 0258). Valid data gives none, since the engine flags only refused pairs.
 */
export function leftoverBlockHints(
  t: Dictionary,
  errors: readonly EngineValidationError[],
  portfolio: Portfolio | null,
): InvalidDataLine[] {
  if (!portfolio) return [];
  const hints: InvalidDataLine[] = [];
  for (const [propertyId, own] of flaggedByProperty(errors, portfolio)) {
    const name =
      portfolio.properties.find((x) => x.id === propertyId)?.name ??
      t.errorBoundary.unknownRecord;
    own.forEach((a, i) => {
      const month = edate(a.startDate, 1).getTime();
      for (const b of own.slice(i + 1)) {
        const start = b.startDate.getTime();
        if (start <= a.startDate.getTime() || start > month) continue;
        const text = t.errorBoundary.leftoverBlock(
          name,
          fmtDate(a.startDate),
          fmtDate(b.startDate),
        );
        // A same-date duplicate pairs with the leftover twice: one line for both.
        if (!hints.some((h) => h.text === text))
          hints.push({ text, propertyId });
      }
    });
  }
  return hints;
}
