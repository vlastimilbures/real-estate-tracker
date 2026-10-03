// The parser of each form field kind. A separate file to avoid a formParse ↔
// loanEventRows import cycle (depcruise): the loan event lists build on formParse.
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
