// The parser of each form field kind. A separate file to avoid a formParse ↔
// loanEventRows import cycle (depcruise): the loan event lists build on formParse.
import {
  fieldHint,
  parseDate,
  parseIntField,
  parseMoney,
  parsePercentToRatio,
  parseSizeField,
  type CollectRules,
  type KindParsers,
} from "./formParse";
import {
  parseDrawRows,
  parsePrepaymentRows,
  parseRecastRows,
  readRows,
  type DrawRow,
  type PrepaymentRow,
  type RecastRow,
} from "./loanEventRows";
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
  size: parseSizeField,
  // A list's text (the mortgage form keeps its lists as rows, so it never reaches these;
  // they go with the list kinds, #490 PR 3).
  draws: (raw) => parseDrawRows(readRows<DrawRow>(raw)),
  prepayments: (raw) => parsePrepaymentRows(readRows<PrepaymentRow>(raw)),
  recasts: (raw) => parseRecastRows(readRows<RecastRow>(raw)),
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
