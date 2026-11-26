// The Import page's messages, one row per code: a CSV parse error (the file's error
// table) and an import plan's problem (the refused table).
import { describe, it, expect } from "vitest";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import type { CsvErrorCode, CsvImportProblem } from "../../../state/csv";
import { csvErrorText, importProblemText } from "../importMessages";
import { inputRuleText } from "../inputRule";
import { fmtCzk } from "../../../lib/format";

const p = en.importPage;

const PARSE_ERRORS: [CsvErrorCode, string][] = [
  [{ code: "required" }, p.errRequired],
  [{ code: "invalidDate", value: "x" }, p.errInvalidDate("x")],
  [
    { code: "impossibleDate", value: "2026-02-30" },
    p.errImpossibleDate("2026-02-30"),
  ],
  [
    { code: "earlyDate", value: "1850-01-01" },
    p.errEarlyDate("1850-01-01", "1900-01-01"),
  ],
  [{ code: "invalidNumber", value: "x" }, p.errInvalidNumber("x")],
  [{ code: "decimalComma", value: "1,5" }, p.errDecimalComma("1,5")],
  [{ code: "negativeAmount", value: "-1" }, p.errNegativeAmount("-1")],
  [{ code: "rateOutOfRange", value: "2" }, p.errRateOutOfRange("2")],
  [{ code: "invalidInteger", value: "1.5" }, p.errInvalidInteger("1.5")],
  [{ code: "notPositive", value: "0" }, p.errNotPositive("0")],
  [
    { code: "outOfRange", value: "99", min: 0, max: 50 },
    en.forms.intRange("0", "50"),
  ],
  [
    { code: "sizeRange", value: "1", min: 5, max: 10000 },
    en.forms.sizeRange("5", fmtCzk(10000, { suffix: false })),
  ],
  [{ code: "invalidBoolean", value: "maybe" }, p.errInvalidBoolean("maybe")],
  [{ code: "instalmentRequired" }, p.errInstalmentRequired],
  [{ code: "duplicateKey", firstRow: 3 }, p.errDuplicateKey(3)],
  [{ code: "malformedRow", expected: 4, found: 3 }, p.errMalformedRow(4, 3)],
  [{ code: "badQuotes" }, p.errBadQuotes],
  [{ code: "duplicateHeader", name: "name" }, p.errDuplicateHeader("name")],
  [{ code: "notUtf8" }, p.errNotUtf8],
  [{ code: "semicolonDelimiter" }, p.errSemicolon],
  [{ code: "fileTooLarge", limitBytes: 5 * 1024 * 1024 }, p.errFileTooLarge(5)],
  [{ code: "tooManyRows", limit: 10000 }, p.errTooManyRows(10000)],
];

describe("csvErrorText", () => {
  it("has a row for every code", () => {
    expect(new Set(PARSE_ERRORS.map(([e]) => e.code)).size).toBe(22);
  });

  it.each(PARSE_ERRORS)("%o", (e, text) => {
    expect(csvErrorText(en, e)).toBe(text);
  });

  it("is translated", () => {
    expect(csvErrorText(cs, { code: "required" })).toBe(
      cs.importPage.errRequired,
    );
  });
});

const PROBLEMS: [CsvImportProblem["problem"], string][] = [
  [{ code: "unknownProperty", value: "Nope" }, p.errUnknownProperty("Nope")],
  [
    { code: "inputRule", rule: "INVALID_RECAST_MATURITY" },
    inputRuleText(en, "INVALID_RECAST_MATURITY"),
  ],
  [
    {
      code: "storedEvent",
      list: "prepayments",
      date: "2027-03-01",
      rule: "INVALID_RECAST_MATURITY",
    },
    p.errStoredEvent(
      p.storedEventKind.prepayments,
      "01.03.2027",
      inputRuleText(en, "INVALID_RECAST_MATURITY"),
    ),
  ],
  [
    { code: "outOfRange", value: "99", min: 0, max: 50 },
    en.forms.intRange("0", "50"),
  ],
  [
    { code: "sizeRange", value: "1", min: 5, max: 10000 },
    en.forms.sizeRange("5", fmtCzk(10000, { suffix: false })),
  ],
];

describe("importProblemText", () => {
  it.each(PROBLEMS)("%o", (problem, text) => {
    expect(importProblemText(en, problem)).toBe(text);
  });
});
