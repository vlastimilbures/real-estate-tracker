// The columns of the four CSV files (#482), one entry each, in template order. The parser
// (csv.ts), the templates and the docs-columns test read them. Pure data: no IO.
import { INT_RANGES, type IntRange } from "../lib/rules";

/** How a cell is read:
 *  - `text`: trimmed text;
 *  - `date`: `YYYY-MM-DD`, a real calendar day from the date floor on;
 *  - `amount`: money, a plain decimal, never negative;
 *  - `unitRate`: a fraction from 0 to 1;
 *  - `signedRate`: a fraction, any sign;
 *  - `int`: whole digits within `range`;
 *  - `size`: a plain decimal within `range`, at most one decimal place (ADR 0236);
 *  - `bool`: true/false, 1/0 or yes/no, in any case. */
export type ColumnKind =
  | "text"
  | "date"
  | "amount"
  | "unitRate"
  | "signedRate"
  | "int"
  | "size"
  | "bool";

interface BaseSpec {
  readonly name: string;
  /** An empty cell (or a missing column) is an error. An optional column that is not in
   *  the file reads as `undefined`, which an update leaves as stored (ADR 0185 §2). */
  readonly required: boolean;
  /** Read before the other columns, so its errors come first in the row. */
  readonly first?: true;
  /** When the cell is empty, the value is derived from the other columns, which are read
   *  first; its errors come last in the row. */
  readonly derive?: "instalment";
}

interface RangedSpec extends BaseSpec {
  readonly kind: "int" | "size";
  /** The accepted range. */
  readonly range: IntRange;
  /** `int`: a dedicated code for a value under the range (the loan term's 0). */
  readonly belowMin?: "notPositive";
}

interface PlainSpec extends BaseSpec {
  readonly kind: Exclude<ColumnKind, RangedSpec["kind"]>;
}

export type ColumnSpec = RangedSpec | PlainSpec;

export const PROPERTY_COLUMNS = [
  { name: "name", kind: "text", required: true, first: true },
  { name: "address", kind: "text", required: false },
  { name: "type", kind: "text", required: false },
  {
    name: "size_m2",
    kind: "size",
    required: false,
    range: INT_RANGES.sizeM2,
  },
  { name: "garage", kind: "bool", required: false },
  { name: "purchase_date", kind: "date", required: true, first: true },
  { name: "purchase_price", kind: "amount", required: true, first: true },
  { name: "appreciation_override_pa", kind: "signedRate", required: false },
  { name: "rent_index_override_pa", kind: "signedRate", required: false },
  { name: "own_cash", kind: "amount", required: false },
  { name: "transaction_costs", kind: "amount", required: false },
  { name: "initial_works", kind: "amount", required: false },
] as const satisfies readonly ColumnSpec[];

export const VALUATION_COLUMNS = [
  { name: "property_name", kind: "text", required: true },
  { name: "valid_from", kind: "date", required: true },
  { name: "valid_to", kind: "date", required: false },
  { name: "market_value", kind: "amount", required: true },
] as const satisfies readonly ColumnSpec[];

export const RENT_COLUMNS = [
  { name: "property_name", kind: "text", required: true },
  { name: "start_date", kind: "date", required: true },
  { name: "end_date", kind: "date", required: false },
  { name: "monthly_rent", kind: "amount", required: true },
] as const satisfies readonly ColumnSpec[];

export const MORTGAGE_COLUMNS = [
  { name: "property_name", kind: "text", required: true },
  { name: "start_date", kind: "date", required: true },
  { name: "initial_principal", kind: "amount", required: true },
  {
    name: "fixation_years",
    kind: "int",
    required: true,
    range: INT_RANGES.fixationYears,
  },
  { name: "interest_rate_pa", kind: "unitRate", required: true },
  // Optional when a loan term is given: derived from principal + rate + term (PMT).
  {
    name: "monthly_instalment",
    kind: "amount",
    required: true,
    derive: "instalment",
  },
  {
    name: "loan_term_years",
    kind: "int",
    required: false,
    range: INT_RANGES.loanTermYears,
    belowMin: "notPositive",
  },
  { name: "contract_maturity_date", kind: "date", required: false },
] as const satisfies readonly ColumnSpec[];
