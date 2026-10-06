// The parser of each form field kind. A separate file to avoid a formParse ↔
// loanEventRows import cycle (depcruise): the loan event lists build on formParse.
import {
  fieldHint,
  parseDate,
  parseDraws,
  parseIntField,
  parseMoney,
  parsePercentToRatio,
  type CollectRules,
  type KindParsers,
} from "./formParse";
import { parsePrepaymentRows, parseRecastRows } from "./loanEventRows";
import type { Dictionary } from "../../i18n";

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

/** The forms' shared rules: these parsers, "Required" for a blank required field, and the
 *  field's expected format (or its range) for text that does not parse. */
export function formRules(t: Pick<Dictionary, "forms">): CollectRules {
  return {
    parsers: FORM_PARSERS,
    blank: () => t.forms.required,
    invalid: (spec) => fieldHint(t, spec),
  };
}
