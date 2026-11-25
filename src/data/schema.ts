// The CURRENT schema of every backed-up table, in one place (#470): columns (in table
// order), unique keys and named CHECKs. Backup's column whitelist and defaults, restore's
// unique keys and the row types are derived from it; a drift test pins it to a freshly
// migrated database (src/data/__tests__/schema.test.ts). The migrations themselves stay
// hand-written SQL: this describes where they end, not how they got there.
//
// Money & rates are TEXT decimal strings, dates TEXT ISO yyyy-mm-dd (CLAUDE.md §5).
import { CHECK_CONSTRAINTS } from "../lib/checkConstraints";

/** What a column holds. money / rate / date / text / json are stored as TEXT, int and
 *  flag (0/1) as INTEGER. */
export type ColumnKind =
  "money" | "rate" | "date" | "int" | "text" | "json" | "flag";

export interface ColumnSpec {
  readonly name: string;
  readonly kind: ColumnKind;
  readonly nullable: boolean;
  /** The migration that added the column (1: the initial schema). */
  readonly addedIn: number;
  /** The value a restore gives the column when an older backup lacks it; also the
   *  column's SQL DEFAULT. None ⇒ NULL. */
  readonly restoreDefault?: string | number;
}

export interface TableSpec {
  readonly columns: readonly ColumnSpec[];
  /** UNIQUE keys besides the `id` primary key. */
  readonly unique: readonly (readonly string[])[];
  /** Named CHECK constraints (src/lib/checkConstraints.ts). */
  readonly checks: readonly string[];
}

/** `assumptions.selling_cost_pct` (v11, ADR 0183): the column's DEFAULT and the value a
 *  restore or a write without one stores. */
export const SELLING_COST_DEFAULT = "0";

const req = <N extends string, K extends ColumnKind>(
  name: N,
  kind: K,
  addedIn = 1,
) => ({ name, kind, nullable: false as const, addedIn });
const opt = <N extends string, K extends ColumnKind>(
  name: N,
  kind: K,
  addedIn = 1,
) => ({ name, kind, nullable: true as const, addedIn });

const checksOf = (table: string) =>
  CHECK_CONSTRAINTS.filter((c) => c.table === table).map((c) => c.name);

const ID = req("id", "text");
const PROPERTY_ID = req("property_id", "text");

export const TABLES = {
  properties: {
    columns: [
      ID,
      req("name", "text"),
      opt("address", "text"),
      opt("type", "text"),
      opt("size_m2", "int"),
      opt("garage", "flag"),
      req("purchase_date", "date"),
      req("purchase_price", "money"),
      opt("appreciation_override_pa", "rate"),
      opt("rent_index_override_pa", "rate"),
      { ...req("active", "flag", 4), restoreDefault: 1 },
      // v10 (ADR 0119): the funding record, every part nullable.
      opt("own_cash", "money", 10),
      opt("transaction_costs", "money", 10),
      opt("initial_works", "money", 10),
      opt("funding_note", "text", 10),
    ],
    unique: [["name"]],
    checks: checksOf("properties"),
  },
  mortgage_blocks: {
    columns: [
      ID,
      PROPERTY_ID,
      req("start_date", "date"),
      req("initial_principal", "money"),
      req("fixation_years", "int"),
      req("interest_rate_pa", "rate"),
      req("monthly_instalment", "money"),
      opt("loan_term_years", "int", 2),
      // JSON [{date, amount}] or NULL
      opt("draws", "json", 3),
      opt("interest_only_until", "date", 3),
      // D-29
      opt("contract_maturity_date", "date", 6),
      // ADR 0109: JSON [{date, amount, effect, fee?}] or NULL
      opt("prepayments", "json", 9),
      // JSON [{date, maturity} | {date, instalment}] or NULL
      opt("recasts", "json", 9),
    ],
    unique: [["property_id", "start_date"]],
    checks: checksOf("mortgage_blocks"),
  },
  valuations: {
    columns: [
      ID,
      PROPERTY_ID,
      req("valid_from", "date"),
      opt("valid_to", "date"),
      req("market_value", "money"),
    ],
    unique: [["property_id", "valid_from"]],
    checks: checksOf("valuations"),
  },
  leases: {
    columns: [
      ID,
      PROPERTY_ID,
      req("start_date", "date"),
      opt("end_date", "date"),
      req("monthly_rent", "money"),
    ],
    unique: [["property_id", "start_date"]],
    checks: checksOf("leases"),
  },
  holding_costs: {
    // All nullable: NULL ⇒ the assumptions default (SPEC §4.1).
    columns: [
      ID,
      PROPERTY_ID,
      opt("property_tax_yr", "money"),
      opt("insurance_yr", "money"),
      opt("mgmt_pct_rent", "rate"),
      opt("maint_pct_rent", "rate"),
      opt("svj_monthly", "money"),
      opt("other_yr", "money"),
    ],
    // One row per property (DUPLICATE_HOLDING_COST, D-37).
    unique: [["property_id"]],
    checks: checksOf("holding_costs"),
  },
  assumptions: {
    // A single row, id = 1.
    columns: [
      req("id", "int"),
      req("base_date", "date"),
      req("appreciation_pa", "rate"),
      req("rent_indexation_pa", "rate"),
      req("vacancy_allowance", "rate"),
      req("post_fixation_reset_rate_pa", "rate"),
      req("horizon_years", "int"),
      req("inflation_pa", "rate"),
      req("default_property_tax_yr", "money"),
      req("default_insurance_yr", "money"),
      req("default_mgmt_pct_rent", "rate"),
      req("default_maint_pct_rent", "rate"),
      req("default_svj_monthly", "money"),
      req("default_other_yr", "money"),
      {
        ...req("selling_cost_pct", "rate", 11),
        restoreDefault: SELLING_COST_DEFAULT,
      },
    ],
    unique: [],
    checks: checksOf("assumptions"),
  },
  scenarios: {
    columns: [
      ID,
      req("name", "text"),
      // JSON: optional level deltas + nested shock descriptors
      req("overrides", "json"),
      req("created_at", "text"),
    ],
    unique: [],
    checks: checksOf("scenarios"),
  },
} as const satisfies Record<string, TableSpec>;

/** The column names of each table, in table order. */
export const columnNames = (
  tables: Readonly<Record<string, TableSpec>>,
): Record<string, readonly string[]> =>
  Object.fromEntries(
    Object.entries(tables).map(([t, s]) => [t, s.columns.map((c) => c.name)]),
  );

/** `table.column` → the value a restore gives that column when the backup lacks it,
 *  for the columns that have one. */
export const restoreDefaults = (
  tables: Readonly<Record<string, TableSpec>>,
): Partial<Record<string, string | number>> =>
  Object.fromEntries(
    Object.entries(tables).flatMap(([t, s]) =>
      s.columns.flatMap((c) =>
        c.restoreDefault === undefined
          ? []
          : [[`${t}.${c.name}`, c.restoreDefault]],
      ),
    ),
  );
