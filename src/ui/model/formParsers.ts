// The parser of each form field kind. Apart from formParse.ts because the loan event
// lists (loanEventRows.ts) build on formParse's own parsers.
import {
  parseDate,
  parseDraws,
  parseIntField,
  parseMoney,
  parsePercentToRatio,
  type KindParsers,
} from "./formParse";
import { parsePrepaymentRows, parseRecastRows } from "./loanEventRows";

/** RecordForm's parsers. Money is non-negative everywhere it's entered (price, rent,
 *  principal, instalment, costs), so negatives are rejected here; pct stays signed (a
 *  declining-market appreciation override is legitimately negative). */
export const FORM_PARSERS: KindParsers = {
  date: parseDate,
  money: (raw) => {
    const m = parseMoney(raw);
    return m === null || m.isNegative() ? null : m;
  },
  pct: parsePercentToRatio,
  int: parseIntField,
  draws: parseDraws,
  prepayments: parsePrepaymentRows,
  recasts: parseRecastRows,
};
