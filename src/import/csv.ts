// CSV import (replaces xlsx importer). Pure parse + validate — no IO, no DB, no React.
// DB write is in csvImport.ts; this file is fully unit-testable in Node.
//
// P5b: a file is read strictly — UTF-8 only, `,` delimiter, `.` decimal point (D-49),
// at most 2 MB and 5,000 data rows (D-53), every row as wide as the header — and each
// error names the physical file line and column, so it can be found in an editor.
import Papa from "papaparse";
import { D, ceilCzk } from "../lib/money";
import { instalmentFor } from "../engine";
import { isIsoDate } from "../data/guards";
import { inRange, INT_RANGES, type IntRange } from "../lib/intRanges";
import { PLAIN_DECIMAL } from "../lib/decimalText";
import { propertyKey } from "../lib/propertyKey";

/** D-53: per-file limits, checked before any row is validated. */
export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 5000;

// Stable, language-agnostic error codes. The UI (Import.tsx) maps each to a translated
// message at the boundary, keeping this pure module free of i18n (CLAUDE.md §4).
export type CsvErrorCode =
  | { code: "required" }
  | { code: "invalidDate"; value: string }
  | { code: "impossibleDate"; value: string }
  | { code: "invalidNumber"; value: string }
  | { code: "decimalComma"; value: string }
  | { code: "negativeAmount"; value: string }
  | { code: "rateOutOfRange"; value: string }
  | { code: "invalidInteger"; value: string }
  | { code: "notPositive"; value: string }
  | { code: "outOfRange"; value: string; min: number; max: number }
  | { code: "invalidBoolean"; value: string }
  | { code: "unknownProperty"; value: string }
  | { code: "instalmentRequired" }
  | { code: "duplicateKey"; firstRow: number }
  | { code: "malformedRow"; expected: number; found: number }
  | { code: "badQuotes" }
  | { code: "notUtf8" }
  | { code: "semicolonDelimiter" }
  | { code: "fileTooLarge"; limitBytes: number }
  | { code: "tooManyRows"; limit: number };

export interface CsvRowError {
  /** Physical file line, 1-based (header = 1); 0 = the whole file. */
  row: number;
  /** Column name; "" when the error is about a whole line or file. */
  field: string;
  error: CsvErrorCode;
}

export interface CsvParseResult<T> {
  rows: T[];
  errors: CsvRowError[];
}

/** What a parse function accepts: the file's raw bytes (the app) or decoded text. */
export type CsvSource = string | Uint8Array;

// --- parsed row shapes (before DB FK resolution) ---

/** Every parsed row remembers its file line, so later checks can point back at it. */
interface Located {
  line: number;
}

export interface ParsedPropertyRow extends Located {
  name: string;
  address: string | null;
  type: string | null;
  size_m2: number | null;
  garage: boolean | null;
  purchase_date: string; // ISO yyyy-mm-dd
  purchase_price: string; // decimal text
  appreciation_override_pa: string | null;
  rent_index_override_pa: string | null;
  /** ADR 0119 §8: optional amounts; blank ⇒ unknown on a new property, kept on a
   *  re-import. */
  own_cash: string | null;
  transaction_costs: string | null;
  initial_works: string | null;
}

export interface ParsedValuationRow extends Located {
  property_name: string;
  valid_from: string;
  valid_to: string | null;
  market_value: string;
}

export interface ParsedRentRow extends Located {
  property_name: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
}

export interface ParsedMortgageRow extends Located {
  property_name: string;
  start_date: string;
  initial_principal: string;
  fixation_years: number;
  interest_rate_pa: string;
  monthly_instalment: string;
  loan_term_years: number | null; // optional; blank ⇒ derive term from instalment
  /** Optional; blank ⇒ a re-import keeps the stored value (DR-129). */
  contract_maturity_date: string | null;
}

// --- reading the file ---

type RawRow = Record<string, string>;

interface RawRecord {
  line: number;
  cells: RawRow;
}

interface RawFile {
  records: RawRecord[];
  /** Errors about the file itself or a whole line; fatal ones leave `records` empty. */
  errors: CsvRowError[];
}

const fileError = (error: CsvErrorCode, row = 0): RawFile => ({
  records: [],
  errors: [{ row, field: "", error }],
});

/** UTF-8 text of the bytes, or `null` when they are not valid UTF-8 (D-49). The
 *  decoder drops a leading BOM. */
function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function readCsv(source: CsvSource): RawFile {
  const size =
    typeof source === "string"
      ? new TextEncoder().encode(source).length
      : source.length;
  if (size > CSV_MAX_BYTES)
    return fileError({ code: "fileTooLarge", limitBytes: CSV_MAX_BYTES });

  let text: string;
  let notUtf8 = false;
  if (typeof source === "string") {
    text = source.replace(/^\uFEFF/, "");
  } else {
    const strict = decodeUtf8(source);
    notUtf8 = strict === null;
    // Undecodable bytes become U+FFFD, which locates the first bad cell below.
    text = strict ?? new TextDecoder("utf-8").decode(source);
  }
  // One newline convention, so file lines can be counted from Papa's cursor.
  text = text.replace(/\r\n?/g, "\n");

  const lines: { cells: string[]; line: number; badQuotes: boolean }[] = [];
  let newlinesSeen = 0;
  let scanned = 0;
  const newlinesUpTo = (end: number) => {
    for (; scanned < end; scanned++) if (text[scanned] === "\n") newlinesSeen++;
    return newlinesSeen;
  };
  Papa.parse<string[]>(text, {
    delimiter: ",", // no auto-detection: a `;` file is rejected (D-49)
    skipEmptyLines: "greedy", // blank and whitespace-only lines (DR-109)
    step: (r) => {
      const cursor = r.meta.cursor;
      const end = text[cursor - 1] === "\n" ? cursor - 1 : cursor;
      const lastLine = newlinesUpTo(end) + 1;
      const inner = r.data.reduce((n, c) => n + c.split("\n").length - 1, 0);
      lines.push({
        cells: r.data,
        line: lastLine - inner,
        badQuotes: r.errors.length > 0,
      });
    },
  });
  const [head, ...body] = lines;
  if (head === undefined) return { records: [], errors: [] };

  const header = head.cells.map((h) => h.trim());

  if (notUtf8) {
    for (const l of lines) {
      const i = l.cells.findIndex((c) => c.includes("\uFFFD"));
      if (i >= 0) {
        const field = header[i] ?? "";
        return {
          records: [],
          errors: [{ row: l.line, field, error: { code: "notUtf8" } }],
        };
      }
    }
    return fileError({ code: "notUtf8" });
  }
  if (header.length === 1 && header[0]?.includes(";"))
    return fileError({ code: "semicolonDelimiter" }, head.line);
  if (body.length > CSV_MAX_ROWS)
    return fileError({ code: "tooManyRows", limit: CSV_MAX_ROWS });

  const records: RawRecord[] = [];
  const errors: CsvRowError[] = [];
  for (const l of body) {
    if (l.badQuotes) {
      errors.push({ row: l.line, field: "", error: { code: "badQuotes" } });
    } else if (l.cells.length !== header.length) {
      errors.push({
        row: l.line,
        field: "",
        error: {
          code: "malformedRow",
          expected: header.length,
          found: l.cells.length,
        },
      });
    } else {
      const cells: RawRow = {};
      // Same length as the header (checked above), so every index exists.
      header.forEach((h, i) => (cells[h] = l.cells[i] ?? ""));
      records.push({ line: l.line, cells });
    }
  }
  return { records, errors };
}

// --- low-level cell parsers ---

/** Collects one row's errors against its file line. */
class RowCtx {
  readonly errors: CsvRowError[] = [];
  constructor(
    readonly cells: RawRow,
    readonly line: number,
  ) {}

  raw(field: string): string {
    return (this.cells[field] ?? "").trim();
  }

  fail(field: string, error: CsvErrorCode): null {
    this.errors.push({ row: this.line, field, error });
    return null;
  }

  optStr(field: string): string | null {
    const v = this.raw(field);
    return v === "" ? null : v;
  }

  reqStr(field: string): string | null {
    const v = this.raw(field);
    return v === "" ? this.fail(field, { code: "required" }) : v;
  }

  reqDate(field: string): string | null {
    const v = this.raw(field);
    return v === ""
      ? this.fail(field, { code: "required" })
      : this.date(field, v);
  }

  optDate(field: string): string | null {
    const v = this.raw(field);
    return v === "" ? null : this.date(field, v);
  }

  private date(field: string, v: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
      return this.fail(field, { code: "invalidDate", value: v });
    // A real calendar date — 2026-02-31 is refused, not rolled over (DR-035).
    if (!isIsoDate(v))
      return this.fail(field, { code: "impossibleDate", value: v });
    return v;
  }

  reqDecimal(field: string, rule: DecimalRule): string | null {
    const v = this.raw(field);
    return v === ""
      ? this.fail(field, { code: "required" })
      : this.decimal(field, v, rule);
  }

  optDecimal(field: string, rule: DecimalRule): string | null {
    const v = this.raw(field);
    return v === "" ? null : this.decimal(field, v, rule);
  }

  private decimal(field: string, v: string, rule: DecimalRule): string | null {
    // Plain decimal notation only: no exponent, hex, `+`, `Infinity` or grouping
    // (DR-036). Parsed straight from the string — never via Number() (CLAUDE.md §5).
    if (!PLAIN_DECIMAL.test(v)) {
      const code = DECIMAL_COMMA.test(v) ? "decimalComma" : "invalidNumber";
      return this.fail(field, { code, value: v });
    }
    const d = D(v);
    // The same bounds the v7 CHECKs and the engine already apply (D-37, D-38).
    if (rule === "amount" && d.isNegative())
      return this.fail(field, { code: "negativeAmount", value: v });
    if (rule === "unitRate" && (d.isNegative() || d.greaterThan(1)))
      return this.fail(field, { code: "rateOutOfRange", value: v });
    return d.toString();
  }

  reqInt(field: string, range: IntRange): number | null {
    const v = this.raw(field);
    return v === ""
      ? this.fail(field, { code: "required" })
      : this.int(field, v, range);
  }

  /** `belowMin`: a dedicated code for a value under the range (the loan term's 0). */
  optInt(
    field: string,
    range: IntRange,
    belowMin?: "notPositive",
  ): number | null {
    const v = this.raw(field);
    return v === "" ? null : this.int(field, v, range, belowMin);
  }

  private int(
    field: string,
    v: string,
    range: IntRange,
    belowMin?: "notPositive",
  ): number | null {
    // Whole, unsigned, plain digits (DR-027): 12.7, -3, 1e2 and 0x10 are refused.
    if (!/^\d{1,9}$/.test(v))
      return this.fail(field, { code: "invalidInteger", value: v });
    const n = Number(v);
    if (belowMin && n < range.min)
      return this.fail(field, { code: belowMin, value: v });
    // The forms' bounds (ADR 0075), applied to CSV by ADR 0076 (DR-177).
    if (!inRange(n, range))
      return this.fail(field, { code: "outOfRange", value: v, ...range });
    return n;
  }

  optBool(field: string): boolean | null {
    const v = this.raw(field).toLowerCase();
    if (v === "") return null;
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    return this.fail(field, { code: "invalidBoolean", value: v });
  }

  /** A child row's property must exist in the DB or the properties file; `known`
   *  holds `propertyKey`s (D-55). */
  knownProperty(field: string, known: Set<string> | undefined): string | null {
    const v = this.reqStr(field);
    if (v !== null && known && !known.has(propertyKey(v)))
      return this.fail(field, { code: "unknownProperty", value: v });
    return v;
  }
}

/** `amount`: money, never negative · `unitRate`: a fraction in 0–1 · `any`: signed. */
type DecimalRule = "amount" | "unitRate" | "any";

/** Czech-Excel style `1 234,5` / `0,0169` (D-49). */
const DECIMAL_COMMA = /^-?\d{1,3}([ \u00A0]\d{3})*,\d+$|^-?\d+,\d+$/;

/** Run `parseRow` over every record; rows with errors are dropped. A row whose natural
 *  key repeats an earlier row's is a fatal duplicate (`keyField` names the column). */
function parseFile<T>(
  source: CsvSource,
  parseRow: (c: RowCtx) => T | null,
  key: (row: T) => string,
  keyField: string,
): CsvParseResult<T & Located> {
  const file = readCsv(source);
  const rows: (T & Located)[] = [];
  const errors = [...file.errors];
  const firstLine = new Map<string, number>();
  for (const rec of file.records) {
    const c = new RowCtx(rec.cells, rec.line);
    const row = parseRow(c);
    if (row !== null && c.errors.length === 0) {
      const k = key(row);
      const first = firstLine.get(k);
      if (first !== undefined) {
        c.fail(keyField, { code: "duplicateKey", firstRow: first });
      } else {
        firstLine.set(k, rec.line);
        rows.push({ ...row, line: rec.line });
      }
    }
    errors.push(...c.errors);
  }
  errors.sort((a, b) => a.row - b.row);
  return { rows, errors };
}

/** Known property names, as `propertyKey`s. */
const keySet = (names: Set<string> | undefined) =>
  names && new Set([...names].map(propertyKey));

const childKey = (name: string, date: string) =>
  `${propertyKey(name)}\u0000${date}`;

// --- public parse functions ---

export function parseProperties(
  csv: CsvSource,
): CsvParseResult<ParsedPropertyRow> {
  return parseFile(
    csv,
    (c) => {
      const name = c.reqStr("name");
      const purchase_date = c.reqDate("purchase_date");
      const purchase_price = c.reqDecimal("purchase_price", "amount");
      const address = c.optStr("address");
      const type = c.optStr("type");
      const size_m2 = c.optInt("size_m2", INT_RANGES.sizeM2);
      const garage = c.optBool("garage");
      const appreciation_override_pa = c.optDecimal(
        "appreciation_override_pa",
        "any",
      );
      const rent_index_override_pa = c.optDecimal(
        "rent_index_override_pa",
        "any",
      );
      const own_cash = c.optDecimal("own_cash", "amount");
      const transaction_costs = c.optDecimal("transaction_costs", "amount");
      const initial_works = c.optDecimal("initial_works", "amount");
      if (!name || !purchase_date || !purchase_price) return null;
      return {
        name,
        address,
        type,
        size_m2,
        garage,
        purchase_date,
        purchase_price,
        appreciation_override_pa,
        rent_index_override_pa,
        own_cash,
        transaction_costs,
        initial_works,
      };
    },
    (r) => propertyKey(r.name),
    "name",
  );
}

export function parseValuations(
  csv: CsvSource,
  knownNames?: Set<string>,
): CsvParseResult<ParsedValuationRow> {
  const known = keySet(knownNames);
  return parseFile(
    csv,
    (c) => {
      const property_name = c.knownProperty("property_name", known);
      const valid_from = c.reqDate("valid_from");
      const valid_to = c.optDate("valid_to");
      const market_value = c.reqDecimal("market_value", "amount");
      if (!property_name || !valid_from || !market_value) return null;
      return { property_name, valid_from, valid_to, market_value };
    },
    (r) => childKey(r.property_name, r.valid_from),
    "valid_from",
  );
}

export function parseRents(
  csv: CsvSource,
  knownNames?: Set<string>,
): CsvParseResult<ParsedRentRow> {
  const known = keySet(knownNames);
  return parseFile(
    csv,
    (c) => {
      const property_name = c.knownProperty("property_name", known);
      const start_date = c.reqDate("start_date");
      const end_date = c.optDate("end_date");
      const monthly_rent = c.reqDecimal("monthly_rent", "amount");
      if (!property_name || !start_date || !monthly_rent) return null;
      return { property_name, start_date, end_date, monthly_rent };
    },
    (r) => childKey(r.property_name, r.start_date),
    "start_date",
  );
}

export function parseMortgages(
  csv: CsvSource,
  knownNames?: Set<string>,
): CsvParseResult<ParsedMortgageRow> {
  const known = keySet(knownNames);
  return parseFile(
    csv,
    (c) => {
      const property_name = c.knownProperty("property_name", known);
      const start_date = c.reqDate("start_date");
      const initial_principal = c.reqDecimal("initial_principal", "amount");
      const fixation_years = c.reqInt(
        "fixation_years",
        INT_RANGES.fixationYears,
      );
      const interest_rate_pa = c.reqDecimal("interest_rate_pa", "unitRate");
      const loan_term_years = c.optInt(
        "loan_term_years",
        INT_RANGES.loanTermYears,
        "notPositive",
      );
      const contract_maturity_date = c.optDate("contract_maturity_date");
      // Instalment is optional when a loan term is given: derive it from principal +
      // rate + term (PMT). A provided instalment is validated and used as-is; blank
      // with no term is still an error.
      let monthly_instalment: string | null;
      if (c.raw("monthly_instalment") !== "") {
        monthly_instalment = c.reqDecimal("monthly_instalment", "amount");
      } else if (
        loan_term_years !== null &&
        initial_principal &&
        interest_rate_pa
      ) {
        // Ceil so the derived instalment always fully amortizes (banks round up).
        monthly_instalment = ceilCzk(
          instalmentFor(
            D(initial_principal),
            D(interest_rate_pa),
            loan_term_years,
          ),
        ).toString();
      } else {
        monthly_instalment = c.fail("monthly_instalment", {
          code: "instalmentRequired",
        });
      }
      if (
        !property_name ||
        !start_date ||
        !initial_principal ||
        fixation_years === null ||
        !interest_rate_pa ||
        !monthly_instalment
      )
        return null;
      return {
        property_name,
        start_date,
        initial_principal,
        fixation_years,
        interest_rate_pa,
        monthly_instalment,
        loan_term_years,
        contract_maturity_date,
      };
    },
    (r) => childKey(r.property_name, r.start_date),
    "start_date",
  );
}

// --- CSV template generators ---

export function propertiesTemplate(): string {
  return [
    "name,address,type,size_m2,garage,purchase_date,purchase_price,appreciation_override_pa,rent_index_override_pa,own_cash,transaction_costs,initial_works",
    "Byt Javorova,Javorova 12 Praha,3 bedroom,71,true,2015-06-01,4080000,,,,,",
  ].join("\n");
}

export function valuationsTemplate(): string {
  return [
    "property_name,valid_from,valid_to,market_value",
    "Byt Javorova,2026-06-01,,10200000",
  ].join("\n");
}

export function rentsTemplate(): string {
  return [
    "property_name,start_date,end_date,monthly_rent",
    "Byt Javorova,2025-09-01,,27200",
  ].join("\n");
}

export function mortgagesTemplate(): string {
  return [
    "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years,contract_maturity_date",
    "Byt Javorova,2021-01-17,1912500,10,0.0169,6721.8,,",
  ].join("\n");
}
