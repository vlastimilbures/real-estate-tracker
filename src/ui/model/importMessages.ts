// The Import page's messages: a CSV parse error and an import plan's problem as
// translated text.
import type { Dictionary } from "../../i18n";
import type { CsvErrorCode, CsvImportProblem } from "../../state/csv";
import { fmtCzk } from "../../lib/format";
import { DATE_FLOOR, isoDay } from "../../lib/day";
import { storedEventText } from "./importPreview";
import { inputRuleText } from "./inputRule";

type Code = CsvErrorCode["code"];
type Of<K extends Code> = Extract<CsvErrorCode, { code: K }>;
const n = (v: number) => fmtCzk(v, { suffix: false });

/** Each code's message; the mapped type keeps the table exhaustive. */
const CSV_ERROR_TEXT: { [K in Code]: (t: Dictionary, e: Of<K>) => string } = {
  required: (t) => t.importPage.errRequired,
  invalidDate: (t, e) => t.importPage.errInvalidDate(e.value),
  invalidNumber: (t, e) => t.importPage.errInvalidNumber(e.value),
  invalidInteger: (t, e) => t.importPage.errInvalidInteger(e.value),
  invalidBoolean: (t, e) => t.importPage.errInvalidBoolean(e.value),
  instalmentRequired: (t) => t.importPage.errInstalmentRequired,
  impossibleDate: (t, e) => t.importPage.errImpossibleDate(e.value),
  // CSV dates are yyyy-mm-dd, so the floor is named that way too.
  earlyDate: (t, e) => t.importPage.errEarlyDate(e.value, isoDay(DATE_FLOOR)),
  decimalComma: (t, e) => t.importPage.errDecimalComma(e.value),
  negativeAmount: (t, e) => t.importPage.errNegativeAmount(e.value),
  rateOutOfRange: (t, e) => t.importPage.errRateOutOfRange(e.value),
  notPositive: (t, e) => t.importPage.errNotPositive(e.value),
  // The forms' range message (ADR 0259); the table already names the cell.
  outOfRange: (t, e) => t.forms.intRange(n(e.min), n(e.max)),
  duplicateKey: (t, e) => t.importPage.errDuplicateKey(e.firstRow),
  malformedRow: (t, e) => t.importPage.errMalformedRow(e.expected, e.found),
  badQuotes: (t) => t.importPage.errBadQuotes,
  duplicateHeader: (t, e) => t.importPage.errDuplicateHeader(e.name),
  notUtf8: (t) => t.importPage.errNotUtf8,
  semicolonDelimiter: (t) => t.importPage.errSemicolon,
  fileTooLarge: (t, e) =>
    t.importPage.errFileTooLarge(e.limitBytes / (1024 * 1024)),
  tooManyRows: (t, e) => t.importPage.errTooManyRows(e.limit),
  // The size's error (ADR 0236 §1).
  sizeRange: (t, e) => t.forms.sizeRange(n(e.min), n(e.max)),
};

/** Render a pure-layer csv error code as a translated message. */
export function csvErrorText(t: Dictionary, e: CsvErrorCode): string {
  const text = CSV_ERROR_TEXT[e.code] as (
    t: Dictionary,
    e: CsvErrorCode,
  ) => string;
  return text(t, e);
}

/** A row the import plan refused, as the refused table's message. */
export function importProblemText(
  t: Dictionary,
  problem: CsvImportProblem["problem"],
): string {
  return problem.code === "unknownProperty"
    ? t.importPage.errUnknownProperty(problem.value)
    : problem.code === "storedEvent"
      ? storedEventText(t, problem)
      : problem.code === "inputRule"
        ? inputRuleText(t, problem.rule)
        : // A merged value out of range (ADR 0257 §2): the parse step's text.
          csvErrorText(t, problem);
}
