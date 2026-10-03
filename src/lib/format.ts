// Display formatting — Czech accounting conventions (CLAUDE.md §5). PURE and
// display-only: this is the boundary where Decimal precision becomes a human string.
// Rounding happens HERE and nowhere in the engine. Czech rendering throughout (the app
// is a Czech real-estate tracker: "Kč", dd.mm.yyyy dates) → space thousands separator,
// comma decimal separator, space before the unit.
import { D, roundCzk, type Numeric } from "./money";
import { getActiveCurrency } from "./currency";

const MINUS = "−"; // real minus sign, not a hyphen

/** Group a non-negative integer string into space-separated thousands: 28730000 → "28 730 000". */
function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Czech decimal: fixed dp, comma separator, grouped integer part. */
function fmtFixed(value: Numeric, dp: number): { neg: boolean; body: string } {
  const d = D(value);
  const fixed = d.abs().toFixed(dp); // round-half-up via Decimal
  // The sign follows the rounded value: −0.0004 shows as "0,0", not "−0,0" (DR-110).
  const neg = d.isNegative() && !D(fixed).isZero();
  const [int = "", frac] = fixed.split(".");
  const body = groupThousands(int) + (frac ? `,${frac}` : "");
  return { neg, body };
}

export interface MoneyOpts {
  /** Wrap negatives in parentheses instead of a leading minus (accounting style). */
  parens?: boolean;
  /** Append the " Kč" suffix (default true). */
  suffix?: boolean;
}

/** `#,##0 "Kč"` — whole CZK, space-grouped. Negatives: parens (accounting) or leading minus. */
export function fmtCzk(value: Numeric, opts: MoneyOpts = {}): string {
  const { parens = false, suffix = true } = opts;
  const { neg, body } = fmtFixed(roundCzk(value), 0);
  const withUnit = suffix ? `${body} ${getActiveCurrency().symbol}` : body;
  if (!neg) return withUnit;
  return parens ? `(${withUnit})` : `${MINUS}${withUnit}`;
}

/** `M Kč` — millions with `dp` decimals, for hero tiles and chart axes. */
export function fmtCzkM(value: Numeric, dp = 1): string {
  const millions = D(value).div(1_000_000);
  const { neg, body } = fmtFixed(millions, dp);
  const withUnit = `${body} ${getActiveCurrency().millionsLabel}`;
  return neg ? `${MINUS}${withUnit}` : withUnit;
}

/** A CZK axis-unit choice for a chart, driven by the max absolute value in its data. */
export interface CzkAxisUnit {
  divisor: number;
  dp: number;
  /** Human label for the unit subtitle on ChartCard, e.g. "M Kč" / "tis. Kč" / "Kč". */
  label: string;
  /** Compact suffix appended to each tick label, e.g. "M" / "tis." / "" (plain Kč). */
  shortLabel: string;
}

/**
 * Pick axis units (M Kč / tis. Kč / Kč) and decimals from a set of numeric values.
 * Looks at the max absolute value and chooses the divisor that keeps ticks readable.
 * Empty / all-zero input falls back to millions (the historical default).
 */
export function pickCzkAxisUnit(
  values: readonly number[],
  /** The UI language's short word for thousands (UX-034); Czech "tis." by default. */
  thousands = "tis.",
): CzkAxisUnit {
  let maxAbs = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const a = Math.abs(v);
    if (a > maxAbs) maxAbs = a;
  }
  const cur = getActiveCurrency();
  if (maxAbs === 0)
    return {
      divisor: 1_000_000,
      dp: 0,
      label: cur.millionsLabel,
      shortLabel: "M",
    };
  if (maxAbs >= 10_000_000)
    return {
      divisor: 1_000_000,
      dp: 0,
      label: cur.millionsLabel,
      shortLabel: "M",
    };
  if (maxAbs >= 1_000_000)
    return {
      divisor: 1_000_000,
      dp: 1,
      label: cur.millionsLabel,
      shortLabel: "M",
    };
  if (maxAbs >= 10_000)
    return {
      divisor: 1_000,
      dp: 0,
      label: `${thousands} ${cur.symbol}`,
      shortLabel: thousands,
    };
  if (maxAbs >= 1_000)
    return {
      divisor: 1_000,
      dp: 1,
      label: `${thousands} ${cur.symbol}`,
      shortLabel: thousands,
    };
  return { divisor: 1, dp: 0, label: cur.symbol, shortLabel: "" };
}

/** Format a value for a chart axis using a pre-picked unit (no unit suffix — that's the subtitle). */
export function fmtCzkAxisValue(value: Numeric, unit: CzkAxisUnit): string {
  const scaled = D(value).div(unit.divisor);
  const { neg, body } = fmtFixed(scaled, unit.dp);
  return neg ? `${MINUS}${body}` : body;
}

/** Format a value for a chart Y-axis tick, appending a compact unit suffix (e.g. "120 M"). */
export function fmtCzkAxisTick(value: Numeric, unit: CzkAxisUnit): string {
  const num = fmtCzkAxisValue(value, unit);
  return unit.shortLabel ? `${num} ${unit.shortLabel}` : num;
}

/** `0.0%` — ratio (0.331) → "33,1 %". */
export function fmtPct(value: Numeric, dp = 1): string {
  const { neg, body } = fmtFixed(D(value).times(100), dp);
  const withUnit = `${body} %`;
  return neg ? `${MINUS}${withUnit}` : withUnit;
}

/** Percentage points, bare — ratio (0.02) → "2,0"; the caller adds the localised unit. */
export function fmtPp(value: Numeric, dp = 1): string {
  const { neg, body } = fmtFixed(D(value).times(100), dp);
  return neg ? `${MINUS}${body}` : body;
}

/** `0.00x` — multiple → "4,85x". */
export function fmtMultiple(value: Numeric, dp = 2): string {
  const { neg, body } = fmtFixed(value, dp);
  return neg ? `${MINUS}${body}x` : `${body}x`;
}

/** DSCR display cap (SPEC, D-35): above 99× a tiny debt service would show an absurd
 *  multiple, so it reads ">99,00x". Display only; the engine value is unchanged. */
const DSCR_CAP = 99;
export function fmtDscr(value: Numeric): string {
  return D(value).greaterThan(DSCR_CAP)
    ? `>${fmtMultiple(DSCR_CAP)}`
    : fmtMultiple(value);
}

// --- spreadsheet cells (D-10) ---------------------------------------------------
// The number an exported cell holds is rounded exactly as the matching fmt* helper
// rounds it for the screen, and stays a number so Excel can still sum it.

/** A value shown with `fmtCzk`: whole units. */
export function cellMoney(value: Numeric): number {
  return roundCzk(value).toNumber();
}

/** A value shown with `fmtPct(value, dp)`: the fraction, to `dp + 2` decimals. */
export function cellPct(value: Numeric, dp = 1): number {
  return D(value)
    .toDecimalPlaces(dp + 2)
    .toNumber();
}

/** A value shown with `fmtMultiple(value, dp)`. */
export function cellMultiple(value: Numeric, dp = 2): number {
  return D(value).toDecimalPlaces(dp).toNumber();
}

/** `dd.mm.yyyy` from a UTC Date. */
export function fmtDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export type Tone = "positive" | "negative" | "neutral";

/** Sign → tone, for red/green text. Zero is neutral. */
export function signTone(value: Numeric): Tone {
  const d = D(value);
  if (d.isZero()) return "neutral";
  return d.isNegative() ? "negative" : "positive";
}
