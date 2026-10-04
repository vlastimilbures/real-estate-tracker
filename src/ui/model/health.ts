// Health-band policy for the LTV and DSCR badges: which value counts as good, a warning
// or bad. Presentation policy, not formatting, so it lives here and not in lib/format
// (DR-048). Dashboard, Properties and Property detail all read these two functions.
import { D, type Decimal } from "../../lib/money";
import type { Dictionary } from "../../i18n";

export type Band = "good" | "warn" | "bad" | "neutral";

const LTV_GOOD = D("0.5");
const LTV_WARN = D("0.75");
const DSCR_GOOD = D("1.2");

/** LTV colour band: lower is safer. null = debt on no value → neutral (ADR 0133). */
export function ltvBand(value: Decimal | null): Band {
  if (value === null) return "neutral";
  // Decimal comparisons, no float conversion at the thresholds (DR-079).
  if (value.lessThanOrEqualTo(LTV_GOOD)) return "good";
  if (value.lessThanOrEqualTo(LTV_WARN)) return "warn";
  return "bad";
}

/** DSCR colour band: ≥1 means rent covers the mortgage. null = no debt → neutral. */
export function dscrBand(value: Decimal | null): Band {
  if (value === null) return "neutral";
  if (value.greaterThanOrEqualTo(DSCR_GOOD)) return "good";
  if (value.greaterThanOrEqualTo(1)) return "warn";
  return "bad";
}

/** The LTV band in words (UX-027): the same words as the Dashboard tile. No value
 *  (null) has no word (ADR 0133). */
export function ltvBandWord(
  t: Pick<Dictionary, "dashboard">,
  value: Decimal | null,
): string | null {
  if (value === null) return null;
  const band = ltvBand(value);
  if (band === "good") return t.dashboard.badgeConservative;
  return band === "warn" ? t.dashboard.badgeModerate : t.dashboard.badgeHigh;
}

/** The DSCR band in words: rent covers the debt service (≥ 1) or falls short. No debt
 *  (null) has no word. */
export function dscrBandWord(
  t: Pick<Dictionary, "dashboard">,
  value: Decimal | null,
): string | null {
  if (value === null) return null;
  return value.greaterThanOrEqualTo(1)
    ? t.dashboard.badgeCoversDebt
    : t.dashboard.badgeShortfall;
}

/** The LTV tile badge: its band and word; no value (null) has no badge (ADR 0133). */
export function ltvBadge(
  t: Pick<Dictionary, "dashboard">,
  value: Decimal | null,
): { band: Band; text: string } | undefined {
  const text = ltvBandWord(t, value);
  return text === null ? undefined : { band: ltvBand(value), text };
}

/** The DSCR tile badge: its band and word; no debt (null) has no badge (ADR 0126). */
export function dscrBadge(
  t: Pick<Dictionary, "dashboard">,
  value: Decimal | null,
): { band: Band; text: string } | undefined {
  const text = dscrBandWord(t, value);
  return text === null ? undefined : { band: dscrBand(value), text };
}

/** Badge text: the formatted number followed by its band word, when there is one. */
export function bandPill(number: string, word: string | null): string {
  return word ? `${number} · ${word}` : number;
}
