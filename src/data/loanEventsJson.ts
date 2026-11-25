// The JSON event columns of a mortgage block (draws, prepayments, recasts; ADR 0109,
// ADR 0184), both ways: stored JSON → sorted engine events, and back. Part of the mapper
// boundary (mappers.ts, toRow.ts), split out of mappers.ts (#471). Each column is one
// `eventCodec` (#472): the shared list rules (NULL/empty, JSON array, known keys, a valid
// date, sorted by date) live there, the column adds only its own fields.
import { money } from "../engine";
import { DataError } from "./errors";
import * as g from "./guards";
import type {
  IsoDate,
  LoanRecast,
  MortgageDraw,
  MortgagePrepayment,
} from "../engine";

/** Date → ISO yyyy-mm-dd. */
export function isoTextReq(v: Date): string {
  return v.toISOString().slice(0, 10);
}

/** Rejects the whole row for one problem of an event item (ROW_INVALID). */
type Bad = (problem: string) => never;

/** What an item reader gets: the row, the item's checked date and the reject. */
interface ItemContext {
  ref: g.RowRef;
  date: IsoDate;
  bad: Bad;
}

interface EventCodecSpec<T extends { date: Date }> {
  /** The column name, as the error text names it. */
  column: string;
  /** Every key an item may hold, `date` included. */
  keys: readonly string[];
  /** The item's own fields, read after its date passed. */
  readItem: (o: Record<string, unknown>, at: ItemContext) => T;
  /** The item's own fields as JSON values, written after its date. */
  writeItem: (item: T) => Record<string, unknown>;
}

interface EventCodec<T> {
  /** Stored JSON → items sorted by date; NULL or an empty array → undefined. */
  parse: (ref: g.RowRef, v: string | null) => T[] | undefined;
  /** Items → JSON; undefined or none → NULL. */
  toJson: (items: T[] | undefined) => string | null;
}

/**
 * One JSON array column (ADR 0109). Any malformed item, or one with a key outside `keys`
 * (a misspelt `fees` would drop the fee, ADR 0116), rejects the whole row (ROW_INVALID).
 */
function eventCodec<T extends { date: Date }>(
  spec: EventCodecSpec<T>,
): EventCodec<T> {
  const { column, keys, readItem, writeItem } = spec;
  return {
    parse(ref, v) {
      if (v == null) return undefined;
      const bad: Bad = (problem) => {
        const line = `${ref.table} ${ref.id}: ${column} ${problem}`;
        throw new DataError(
          "ROW_INVALID",
          `Corrupt mortgage ${column} JSON: ${line}.`,
          [line],
        );
      };
      const items = readArray(v, bad)
        .map((x) => readItem(...known(ref, column, keys, x, bad)))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      return items.length ? items : undefined;
    },
    toJson(items) {
      if (!items || items.length === 0) return null;
      return JSON.stringify(
        items.map((item) => ({
          date: isoTextReq(item.date),
          ...writeItem(item),
        })),
      );
    },
  };
}

function readArray(v: string, bad: Bad): unknown[] {
  let arr: unknown;
  try {
    arr = JSON.parse(v);
  } catch {
    return bad("is not valid JSON");
  }
  return Array.isArray(arr) ? arr : bad("is not an array");
}

/** An item with only known keys and a valid date, ready for its column's reader. */
function known(
  ref: g.RowRef,
  column: string,
  keys: readonly string[],
  x: unknown,
  bad: Bad,
): [Record<string, unknown>, ItemContext] {
  const o = (x ?? {}) as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => !keys.includes(k));
  if (extra !== undefined) bad(`has an unknown field ${extra}`);
  if (typeof o.date !== "string" || !g.isIsoDate(o.date))
    bad("has an invalid date");
  return [o, { ref, date: g.date(ref, column, o.date), bad }];
}

/** A required decimal-string amount of an event item. */
function eventAmount(value: unknown, bad: Bad): ReturnType<typeof money> {
  const amount = g.parseDecimalText(value);
  return amount ? money(amount) : bad("has an invalid amount");
}

/** Draws (ADR 0184): only `date` and `amount`. */
const draws = eventCodec<MortgageDraw>({
  column: "draws",
  keys: ["date", "amount"],
  readItem: (o, { date, bad }) => ({
    date,
    amount: eventAmount(o.amount, bad),
  }),
  writeItem: (d) => ({ amount: d.amount.toString() }),
});

const prepayments = eventCodec<MortgagePrepayment>({
  column: "prepayments",
  keys: ["date", "amount", "effect", "fee"],
  readItem: (o, { date, bad }) => {
    if (o.effect !== "lowerInstalment" && o.effect !== "shortenTerm")
      return bad("has an invalid effect");
    return {
      date,
      amount: eventAmount(o.amount, bad),
      effect: o.effect,
      fee: o.fee == null ? undefined : eventAmount(o.fee, bad),
    };
  },
  writeItem: (p) => ({
    amount: p.amount.toString(),
    effect: p.effect,
    ...(p.fee ? { fee: p.fee.toString() } : {}),
  }),
});

/** Recasts: either a new `maturity` date or a new `instalment`. */
const recasts = eventCodec<LoanRecast>({
  column: "recasts",
  keys: ["date", "maturity", "instalment"],
  readItem: (o, { ref, date, bad }): LoanRecast => {
    if ((o.maturity == null) === (o.instalment == null))
      return bad("needs either a maturity or an instalment");
    if (o.instalment != null)
      return { date, instalment: eventAmount(o.instalment, bad) };
    if (typeof o.maturity !== "string" || !g.isIsoDate(o.maturity))
      return bad("has an invalid maturity");
    return { date, maturity: g.date(ref, "recasts", o.maturity) };
  },
  writeItem: (r) =>
    r.maturity === undefined
      ? { instalment: r.instalment.toString() }
      : { maturity: isoTextReq(r.maturity) },
});

export const parseDraws = draws.parse;
export const drawsToJson = draws.toJson;
export const parsePrepayments = prepayments.parse;
export const prepaymentsToJson = prepayments.toJson;
export const parseRecasts = recasts.parse;
export const recastsToJson = recasts.toJson;
