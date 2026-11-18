// CSV import (replaces xlsx importer). Pure parse + validate — no IO, no DB, no React.
// DB write is in csvImport.ts; this file is fully unit-testable in Node.
//
// P5b: a file is read strictly — UTF-8 only, `,` delimiter, `.` decimal point (D-49),
// at most 2 MB and 5,000 data rows (D-53), every row as wide as the header — and each
// error names the physical file line and column, so it can be found in an editor.
import Papa from "papaparse";
import { D } from "../lib/money";
import { calendarDay, suggestedInstalment } from "../engine";
import {
  DATE_FLOOR_YEAR,
  inRange,
  oneDecimalText,
  outsideUnitRate,
  WHOLE_DIGITS,
  type IntRange,
} from "../lib/rules";
import { PLAIN_DECIMAL } from "../lib/decimalText";
import { propertyKey } from "../lib/propertyKey";
import {
  MORTGAGE_COLUMNS,
  PROPERTY_COLUMNS,
  RENT_COLUMNS,
  VALUATION_COLUMNS,
  type ColumnSpec,
} from "./columns";

/** D-53: per-file limits, checked before any row is validated. */
export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 5000;

// Stable, language-agnostic error codes. The UI (Import.tsx) maps each to a translated
// message at the boundary, keeping this pure module free of i18n (CLAUDE.md §4).
export type CsvErrorCode =
  | { code: "required" }
  | { code: "invalidDate"; value: string }
  | { code: "impossibleDate"; value: string }
  /** Before the floor for new dates (DATE_FLOOR_YEAR in lib/rules.ts, ADR 0149 §5). */
  | { code: "earlyDate"; value: string }
  | { code: "invalidNumber"; value: string }
  | { code: "decimalComma"; value: string }
  | { code: "negativeAmount"; value: string }
  | { code: "rateOutOfRange"; value: string }
  | { code: "invalidInteger"; value: string }
  | { code: "notPositive"; value: string }
  | { code: "outOfRange"; value: string; min: number; max: number }
  /** A size outside its range or with two or more decimals (ADR 0236 §1). */
  | { code: "sizeRange"; value: string; min: number; max: number }
  | { code: "invalidBoolean"; value: string }
  | { code: "instalmentRequired" }
  | { code: "duplicateKey"; firstRow: number }
  | { code: "malformedRow"; expected: number; found: number }
  | { code: "badQuotes" }
  | { code: "duplicateHeader"; name: string }
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

/** An optional cell: `null` = empty, `undefined` = the column is not in the file, which an
 *  update leaves as stored (ADR 0185 §2). */
type Cell<T> = T | null | undefined;

/** Every parsed row remembers its file line, so later checks can point back at it. */
interface Located {
  line: number;
}

export interface ParsedPropertyRow extends Located {
  name: string;
  address: Cell<string>;
  type: Cell<string>;
  size_m2: Cell<number>;
  garage: Cell<boolean>;
  purchase_date: string; // ISO yyyy-mm-dd
  purchase_price: string; // decimal text
  appreciation_override_pa: Cell<string>;
  rent_index_override_pa: Cell<string>;
  /** ADR 0119 §8: optional amounts; blank ⇒ unknown on a new property, kept on a
   *  re-import. */
  own_cash: Cell<string>;
  transaction_costs: Cell<string>;
  initial_works: Cell<string>;
}

export interface ParsedValuationRow extends Located {
  property_name: string;
  valid_from: string;
  valid_to: Cell<string>;
  market_value: string;
}

export interface ParsedRentRow extends Located {
  property_name: string;
  start_date: string;
  end_date: Cell<string>;
  monthly_rent: string;
}

export interface ParsedMortgageRow extends Located {
  property_name: string;
  start_date: string;
  initial_principal: string;
  fixation_years: number;
  interest_rate_pa: string;
  monthly_instalment: string;
  loan_term_years: Cell<number>; // optional; blank ⇒ derive term from instalment
  /** Optional; blank ⇒ a re-import keeps the stored value (DR-129). */
  contract_maturity_date: Cell<string>;
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

/** One error about a whole line (or, with `row` 0, the file); it leaves no records. */
const lineError = (
  row: number,
  field: string,
  error: CsvErrorCode,
): RawFile => ({
  records: [],
  errors: [{ row, field, error }],
});

/** An error about the whole file, or (with `row`) a whole line, naming no column. */
const fileError = (error: CsvErrorCode, row = 0): RawFile =>
  lineError(row, "", error);

/** UTF-8 text of the bytes, or `null` when they are not valid UTF-8 (D-49). The
 *  decoder drops a leading BOM. */
function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

interface Decoded {
  /** The text with one newline convention and no leading BOM. */
  text: string;
  /** The bytes were not valid UTF-8 (D-49): undecodable bytes are U+FFFD in `text`. */
  notUtf8: boolean;
}

/** The source's text, or `undefined` when it is over the size limit (D-53). A string is
 *  measured as its UTF-8 bytes. */
function decodeSource(source: CsvSource): Decoded | undefined {
  const size =
    typeof source === "string"
      ? new TextEncoder().encode(source).length
      : source.length;
  if (size > CSV_MAX_BYTES) return undefined;

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
  return { text: text.replace(/\r\n?/g, "\n"), notUtf8 };
}

interface ScannedLine {
  cells: string[];
  /** Physical file line of the record's first line (a quoted cell may span lines). */
  line: number;
  badQuotes: boolean;
}

/** The text's records, skipping blank and whitespace-only lines. */
function scanLines(text: string): ScannedLine[] {
  const lines: ScannedLine[] = [];
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
  return lines;
}

/** The first cell holding U+FFFD, named by its header column. */
function notUtf8Error(lines: ScannedLine[], header: string[]): RawFile {
  for (const l of lines) {
    const i = l.cells.findIndex((c) => c.includes("\uFFFD"));
    if (i >= 0) return lineError(l.line, header[i] ?? "", { code: "notUtf8" });
  }
  return fileError({ code: "notUtf8" });
}

/** A fatal error about the whole file, found from its header, or `undefined`. In order:
 *  not UTF-8, a semicolon delimiter, a repeated column name, too many rows. */
function checkHeader(
  lines: ScannedLine[],
  headLine: number,
  header: string[],
  notUtf8: boolean,
): RawFile | undefined {
  if (notUtf8) return notUtf8Error(lines, header);
  if (header.length === 1 && header[0]?.includes(";"))
    return fileError({ code: "semicolonDelimiter" }, headLine);
  // A repeated name would let the right-hand column win silently (ADR 0185 §1). Empty
  // names (a spreadsheet's trailing blank columns) are extra columns, ignored as before.
  const twice = header.find((h, i) => h !== "" && header.indexOf(h) !== i);
  if (twice !== undefined)
    return lineError(headLine, twice, { code: "duplicateHeader", name: twice });
  if (lines.length - 1 > CSV_MAX_ROWS)
    return fileError({ code: "tooManyRows", limit: CSV_MAX_ROWS });
  return undefined;
}

/** Each data line as a record keyed by the header, or a badQuotes/malformedRow error. */
function buildRecords(body: ScannedLine[], header: string[]): RawFile {
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

/** The file's records, checked in order: size, empty, not UTF-8, semicolon delimiter,
 *  repeated column, too many rows, then each line's quotes and width. */
function readCsv(source: CsvSource): RawFile {
  const decoded = decodeSource(source);
  if (decoded === undefined)
    return fileError({ code: "fileTooLarge", limitBytes: CSV_MAX_BYTES });
  const lines = scanLines(decoded.text);
  const [head, ...body] = lines;
  if (head === undefined) return { records: [], errors: [] };
  const header = head.cells.map((h) => h.trim());
  return (
    checkHeader(lines, head.line, header, decoded.notUtf8) ??
    buildRecords(body, header)
  );
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

  /** One cell, read as its spec says. An optional column not in the file's header is
   *  `undefined` (ADR 0185 §2); an empty optional cell is `null`. */
  read(spec: ColumnSpec): unknown {
    const field = spec.name;
    if (!spec.required && !(field in this.cells)) return undefined;
    const v = this.raw(field);
    if (v === "")
      return spec.required ? this.fail(field, { code: "required" }) : null;
    return this.value(spec, v);
  }

  /** A non-empty cell by its kind. */
  private value(spec: ColumnSpec, v: string): unknown {
    const field = spec.name;
    switch (spec.kind) {
      case "text":
        return v;
      case "date":
        return this.date(field, v);
      case "amount":
        return this.decimal(field, v, "amount");
      case "unitRate":
        return this.decimal(field, v, "unitRate");
      case "signedRate":
        return this.decimal(field, v, "any");
      case "int":
        return this.int(field, v, spec.range, spec.belowMin);
      case "size":
        return this.size(field, v, spec.range);
      case "bool":
        return this.bool(field, v);
    }
  }

  private date(field: string, v: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
      return this.fail(field, { code: "invalidDate", value: v });
    const [y, m, d] = v.split("-").map(Number) as [number, number, number];
    // A real calendar date — 2026-02-31 is refused, not rolled over (DR-035).
    if (!calendarDay(y, m, d))
      return this.fail(field, { code: "impossibleDate", value: v });
    // New dates start on the date floor (lib/rules.ts), as in the form (ADR 0149 §5).
    if (y < DATE_FLOOR_YEAR)
      return this.fail(field, { code: "earlyDate", value: v });
    return v;
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
    if (rule === "unitRate" && outsideUnitRate(d))
      return this.fail(field, { code: "rateOutOfRange", value: v });
    return d.toString();
  }

  /** `belowMin`: a dedicated code for a value under the range (the loan term's 0). */
  private int(
    field: string,
    v: string,
    range: IntRange,
    belowMin?: "notPositive",
  ): number | null {
    // Whole, unsigned, plain digits (DR-027): 12.7, -3, 1e2 and 0x10 are refused.
    if (!WHOLE_DIGITS.test(v))
      return this.fail(field, { code: "invalidInteger", value: v });
    const n = Number(v);
    if (belowMin && n < range.min)
      return this.fail(field, { code: belowMin, value: v });
    // The forms' bounds (ADR 0075), applied to CSV by ADR 0076 (DR-177).
    if (!inRange(n, range))
      return this.fail(field, { code: "outOfRange", value: v, ...range });
    return n;
  }

  /** A size: a plain decimal from the range with at most one decimal place (ADR 0236). */
  private size(field: string, v: string, range: IntRange): number | null {
    if (!PLAIN_DECIMAL.test(v)) {
      const code = DECIMAL_COMMA.test(v) ? "decimalComma" : "invalidNumber";
      return this.fail(field, { code, value: v });
    }
    const n = Number(v);
    // One message for every refusal of a number: the range with one decimal place, as
    // the form and restore say (ADR 0236 §1). Decimals count by value, like the form.
    if (!oneDecimalText(v) || !inRange(n, range))
      return this.fail(field, { code: "sizeRange", value: v, ...range });
    return n;
  }

  private bool(field: string, cell: string): boolean | null {
    const v = cell.toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    return this.fail(field, { code: "invalidBoolean", value: v });
  }
}

/** `amount`: money, never negative · `unitRate`: a fraction in 0–1 · `any`: signed. */
type DecimalRule = "amount" | "unitRate" | "any";

/** Czech-Excel style `1 234,5` / `0,0169` (D-49). */
const DECIMAL_COMMA = /^-?\d{1,3}([ \u00A0]\d{3})*,\d+$|^-?\d+,\d+$/;

type Values = ReadonlyMap<string, unknown>;

/** The mortgage instalment of an empty cell: with a loan term, derived from principal +
 *  rate + term (PMT); a provided instalment is validated and used as-is, and blank with
 *  no term is still an error. */
function deriveInstalment(c: RowCtx, field: string, v: Values): string | null {
  const term = v.get("loan_term_years");
  const principal = v.get("initial_principal");
  const rate = v.get("interest_rate_pa");
  if (
    typeof term === "number" &&
    typeof principal === "string" &&
    typeof rate === "string"
  )
    // The engine's suggestion: ceiled so it always fully amortizes (banks round up).
    return suggestedInstalment(D(principal), D(rate), term).toString();
  return c.fail(field, { code: "instalmentRequired" });
}

/** The order the cells of a row are read in, which is the order of its errors: the
 *  `first` columns, then the others in template order, then the derived ones. */
const evaluationOrder = (columns: readonly ColumnSpec[]): ColumnSpec[] => [
  ...columns.filter((s) => s.first),
  ...columns.filter((s) => !s.first && !s.derive),
  ...columns.filter((s) => s.derive),
];

function readRow(c: RowCtx, order: readonly ColumnSpec[]): Values {
  const values = new Map<string, unknown>();
  for (const spec of order)
    values.set(
      spec.name,
      spec.derive && c.raw(spec.name) === ""
        ? deriveInstalment(c, spec.name, values)
        : c.read(spec),
    );
  return values;
}

/** A row's columns: its keys without `line`. */
type RowColumns<R> = Exclude<keyof R, "line">;

/** Compile-time check: the spec names of a file are exactly its row's columns. */
type NamesMatch<R, C extends readonly ColumnSpec[]> = [RowColumns<R>] extends [
  C[number]["name"],
]
  ? [C[number]["name"]] extends [RowColumns<R>]
    ? unknown
    : never
  : never;

/** Read every record by the column specs; rows with errors are dropped. A row keeps the
 *  template's key order, an absent column as an own key holding `undefined`, and `line`
 *  last. A row whose natural key repeats an earlier row's is a fatal duplicate, reported
 *  on the last key column. The key is the property name (`propertyKey`, D-55; NFC,
 *  ADR 0237), plus the key date for a child file. It counts once its own cells are
 *  valid, even if another cell of the row is not, so every duplicate shows in one round
 *  (ADR 0185 §3). */
function parseFile<R extends Located, C extends readonly ColumnSpec[]>(
  source: CsvSource,
  columns: C & NamesMatch<R, C>,
  /** The key columns: the property name first, then a child file's key date. */
  keyCells: readonly C[number]["name"][],
): CsvParseResult<R> {
  const file = readCsv(source);
  const rows: R[] = [];
  const errors = [...file.errors];
  const order = evaluationOrder(columns);
  const firstLine = new Map<string, number>();
  const keyField = keyCells[keyCells.length - 1] ?? "";
  for (const rec of file.records) {
    const c = new RowCtx(rec.cells, rec.line);
    const values = readRow(c, order);
    if (!c.errors.some((e) => keyCells.includes(e.field))) {
      const [name = "", ...rest] = keyCells;
      const k = [propertyKey(c.raw(name)), ...rest.map((f) => c.raw(f))].join(
        "\u0000",
      );
      const first = firstLine.get(k);
      if (first === undefined) firstLine.set(k, rec.line);
      else c.fail(keyField, { code: "duplicateKey", firstRow: first });
    }
    if (c.errors.length === 0) {
      const row: Record<string, unknown> = {};
      for (const spec of columns) row[spec.name] = values.get(spec.name);
      row.line = rec.line;
      rows.push(row as R);
    }
    errors.push(...c.errors);
  }
  errors.sort((a, b) => a.row - b.row);
  return { rows, errors };
}

// --- public parse functions ---

export function parseProperties(
  csv: CsvSource,
): CsvParseResult<ParsedPropertyRow> {
  return parseFile<ParsedPropertyRow, typeof PROPERTY_COLUMNS>(
    csv,
    PROPERTY_COLUMNS,
    ["name"],
  );
}

export function parseValuations(
  csv: CsvSource,
): CsvParseResult<ParsedValuationRow> {
  return parseFile<ParsedValuationRow, typeof VALUATION_COLUMNS>(
    csv,
    VALUATION_COLUMNS,
    ["property_name", "valid_from"],
  );
}

export function parseRents(csv: CsvSource): CsvParseResult<ParsedRentRow> {
  return parseFile<ParsedRentRow, typeof RENT_COLUMNS>(csv, RENT_COLUMNS, [
    "property_name",
    "start_date",
  ]);
}

export function parseMortgages(
  csv: CsvSource,
): CsvParseResult<ParsedMortgageRow> {
  return parseFile<ParsedMortgageRow, typeof MORTGAGE_COLUMNS>(
    csv,
    MORTGAGE_COLUMNS,
    ["property_name", "start_date"],
  );
}

// --- CSV template generators ---

/** A template: the spec's header and one literal example row. */
const template = (columns: readonly ColumnSpec[], example: string): string =>
  [columns.map((c) => c.name).join(","), example].join("\n");

export function propertiesTemplate(): string {
  return template(
    PROPERTY_COLUMNS,
    "Byt Javorova,Javorova 12 Praha,3 bedroom,71,true,2015-06-01,4080000,,,,,",
  );
}

export function valuationsTemplate(): string {
  return template(VALUATION_COLUMNS, "Byt Javorova,2026-06-01,,10200000");
}

export function rentsTemplate(): string {
  return template(RENT_COLUMNS, "Byt Javorova,2025-09-01,,27200");
}

export function mortgagesTemplate(): string {
  return template(
    MORTGAGE_COLUMNS,
    "Byt Javorova,2021-01-17,1912500,10,0.0169,6721.8,,",
  );
}
