// The JSON event columns of a mortgage block (draws, prepayments, recasts; ADR 0109,
// ADR 0184), both ways: stored JSON → sorted engine events, and back. Part of the mapper
// boundary (mappers.ts, toRow.ts), split out of mappers.ts (#471).
import { money } from "../engine";
import { DataError } from "./errors";
import * as g from "./guards";
import type { LoanRecast, MortgageDraw, MortgagePrepayment } from "../engine";

/** Date → ISO yyyy-mm-dd. */
export function isoTextReq(v: Date): string {
  return v.toISOString().slice(0, 10);
}

/** JSON tranche array → MortgageDraw[] (sorted), NULL/empty → undefined; only `date` and
 *  `amount` are allowed (ADR 0184). */
export function parseDraws(
  ref: g.RowRef,
  v: string | null,
): MortgageDraw[] | undefined {
  return parseEventList(ref, "draws", v, ["date", "amount"], (o, bad) => {
    if (typeof o.date !== "string" || !g.isIsoDate(o.date))
      return bad("has an invalid date");
    return {
      date: g.date(ref, "draws", o.date),
      amount: eventAmount(o.amount, bad),
    };
  });
}
/**
 * A JSON array column → items sorted by date, NULL/empty → undefined (ADR 0109). Any
 * malformed item, or one with a key outside `keys` (a misspelt `fees` would drop the
 * fee, ADR 0116), rejects the whole row (ROW_INVALID), like the draws column.
 */
function parseEventList<T extends { date: Date }>(
  ref: g.RowRef,
  column: string,
  v: string | null,
  keys: readonly string[],
  item: (o: Record<string, unknown>, bad: (problem: string) => never) => T,
): T[] | undefined {
  if (v == null) return undefined;
  const bad = (problem: string): never => {
    const line = `${ref.table} ${ref.id}: ${column} ${problem}`;
    throw new DataError(
      "ROW_INVALID",
      `Corrupt mortgage ${column} JSON: ${line}.`,
      [line],
    );
  };
  let arr: unknown;
  try {
    arr = JSON.parse(v);
  } catch {
    return bad("is not valid JSON");
  }
  if (!Array.isArray(arr)) return bad("is not an array");
  const known = (x: unknown) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const extra = Object.keys(o).find((k) => !keys.includes(k));
    return extra === undefined ? o : bad(`has an unknown field ${extra}`);
  };
  const items = arr
    .map((x: unknown) => item(known(x), bad))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return items.length ? items : undefined;
}

/** A required decimal-string amount of an event item. */
function eventAmount(
  value: unknown,
  bad: (problem: string) => never,
): ReturnType<typeof money> {
  const amount = g.parseDecimalText(value);
  return amount ? money(amount) : bad("has an invalid amount");
}

export function parsePrepayments(
  ref: g.RowRef,
  v: string | null,
): MortgagePrepayment[] | undefined {
  const keys = ["date", "amount", "effect", "fee"] as const;
  return parseEventList(ref, "prepayments", v, keys, (o, bad) => {
    if (typeof o.date !== "string" || !g.isIsoDate(o.date))
      return bad("has an invalid date");
    if (o.effect !== "lowerInstalment" && o.effect !== "shortenTerm")
      return bad("has an invalid effect");
    return {
      date: g.date(ref, "prepayments", o.date),
      amount: eventAmount(o.amount, bad),
      effect: o.effect,
      fee: o.fee == null ? undefined : eventAmount(o.fee, bad),
    };
  });
}

export function parseRecasts(
  ref: g.RowRef,
  v: string | null,
): LoanRecast[] | undefined {
  const keys = ["date", "maturity", "instalment"] as const;
  return parseEventList(ref, "recasts", v, keys, (o, bad): LoanRecast => {
    if (typeof o.date !== "string" || !g.isIsoDate(o.date))
      return bad("has an invalid date");
    const date = g.date(ref, "recasts", o.date);
    if ((o.maturity == null) === (o.instalment == null))
      return bad("needs either a maturity or an instalment");
    if (o.instalment != null)
      return { date, instalment: eventAmount(o.instalment, bad) };
    if (typeof o.maturity !== "string" || !g.isIsoDate(o.maturity))
      return bad("has an invalid maturity");
    return { date, maturity: g.date(ref, "recasts", o.maturity) };
  });
}

/** Prepayments → JSON (amounts as decimal strings), empty/undefined → NULL. */
export function prepaymentsToJson(
  prepayments: MortgagePrepayment[] | undefined,
): string | null {
  if (!prepayments || prepayments.length === 0) return null;
  return JSON.stringify(
    prepayments.map((p) => ({
      date: isoTextReq(p.date),
      amount: p.amount.toString(),
      effect: p.effect,
      ...(p.fee ? { fee: p.fee.toString() } : {}),
    })),
  );
}

/** Recasts → JSON, empty/undefined → NULL. */
export function recastsToJson(
  recasts: LoanRecast[] | undefined,
): string | null {
  if (!recasts || recasts.length === 0) return null;
  return JSON.stringify(
    recasts.map((r) =>
      r.maturity === undefined
        ? { date: isoTextReq(r.date), instalment: r.instalment.toString() }
        : { date: isoTextReq(r.date), maturity: isoTextReq(r.maturity) },
    ),
  );
}

/** MortgageDraw[] → JSON (amounts as decimal strings), empty/undefined → NULL. */
export function drawsToJson(draws: MortgageDraw[] | undefined): string | null {
  if (!draws || draws.length === 0) return null;
  return JSON.stringify(
    draws.map((d) => ({
      date: isoTextReq(d.date),
      amount: d.amount.toString(),
    })),
  );
}
