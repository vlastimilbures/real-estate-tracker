// DB write layer for CSV import. Distinct from csv.ts (pure parse) so each is testable.
//
// All or nothing (P5b, DR-023): the current rows are read once, every property name is
// resolved (D-55) and the merged result is checked against the engine's input rules
// BEFORE anything is written. The write is then a single `Sql.transaction` (D-14): every
// statement commits, or none does.
import type { Sql, SqlStatement } from "../data/sql";
import { insertStatement } from "../data/repositories";
import {
  rowToHoldingCost,
  rowToLease,
  rowToMortgageBlock,
  rowToProperty,
  rowToValuation,
  type HoldingCostRow,
  type LeaseRow,
  type MortgageBlockRow,
  type PropertyRow,
  type ValuationRow,
} from "../data/mappers";
import {
  validatePortfolio,
  type ValidationCode,
  type ValidationEntity,
} from "../engine";
import {
  propertyKey,
  type ParsedMortgageRow,
  type ParsedPropertyRow,
  type ParsedRentRow,
  type ParsedValuationRow,
} from "./csv";
import { slug } from "../lib/slug";

export interface CsvImportBatch {
  properties?: ParsedPropertyRow[] | undefined;
  valuations?: ParsedValuationRow[] | undefined;
  rents?: ParsedRentRow[] | undefined;
  mortgages?: ParsedMortgageRow[] | undefined;
}

export interface CsvImportReport {
  upserted: {
    properties: number;
    valuations: number;
    leases: number;
    mortgage_blocks: number;
  };
}

export type CsvFile = keyof CsvImportBatch;

export type CsvImportProblemCode =
  | { code: "unknownProperty"; value: string }
  /** The merged data breaks an engine input rule (D-17, D-27, D-37, D-42). */
  | { code: "inputRule"; rule: ValidationCode };

export interface CsvImportProblem {
  file: CsvFile;
  /** Physical file line. */
  row: number;
  field: string;
  problem: CsvImportProblemCode;
}

/** The import was refused before anything was written. */
export class CsvImportError extends Error {
  readonly problems: CsvImportProblem[];
  constructor(problems: CsvImportProblem[]) {
    super(
      `CSV import refused: ${problems.length} problem(s). Nothing was imported.`,
    );
    this.name = "CsvImportError";
    this.problems = problems;
  }
}

/** The stored rows an import plan is computed against. */
interface ImportTables {
  properties: PropertyRow[];
  mortgage_blocks: MortgageBlockRow[];
  valuations: ValuationRow[];
  leases: LeaseRow[];
  holding_costs: HoldingCostRow[];
}

async function readTables(sql: Sql): Promise<ImportTables> {
  const [properties, mortgage_blocks, valuations, leases, holding_costs] =
    await Promise.all([
      sql.select<PropertyRow>("SELECT * FROM properties ORDER BY id"),
      sql.select<MortgageBlockRow>("SELECT * FROM mortgage_blocks ORDER BY id"),
      sql.select<ValuationRow>("SELECT * FROM valuations ORDER BY id"),
      sql.select<LeaseRow>("SELECT * FROM leases ORDER BY id"),
      sql.select<HoldingCostRow>("SELECT * FROM holding_costs ORDER BY id"),
    ]);
  return { properties, mortgage_blocks, valuations, leases, holding_costs };
}

/** UPDATE `table` SET <only these columns> WHERE id = ? — columns the CSV does not
 *  model are left as stored. */
function updateStatement(
  table: string,
  id: string,
  values: Record<string, unknown>,
): SqlStatement {
  const cols = Object.keys(values);
  return {
    query: `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
    params: [...Object.values(values), id],
  };
}

const snake = (field: string) =>
  field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Replace the row with the same id in `rows`, or append it. */
function put<R extends { id: string }>(rows: R[], row: R): void {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i >= 0) rows[i] = row;
  else rows.push(row);
}

/** What an import would write, computed without touching the DB. */
interface ImportPlan {
  statements: SqlStatement[];
  /** Non-empty ⇒ the import must be refused; nothing may be written. */
  problems: CsvImportProblem[];
  report: CsvImportReport;
}

/** Match every row against `tables` (D-55), build the write statements and check the
 *  merged result against the engine's input rules. Pure: `tables` is not modified. */
function planImport(batch: CsvImportBatch, tables: ImportTables): ImportPlan {
  const db: ImportTables = {
    properties: [...tables.properties],
    mortgage_blocks: [...tables.mortgage_blocks],
    valuations: [...tables.valuations],
    leases: [...tables.leases],
    holding_costs: [...tables.holding_costs],
  };
  const statements: SqlStatement[] = [];
  const problems: CsvImportProblem[] = [];
  /** Which file line produced each written row, as `${entity}:${id}`. */
  const origin = new Map<string, { file: CsvFile; row: number }>();
  const report: CsvImportReport = {
    upserted: { properties: 0, valuations: 0, leases: 0, mortgage_blocks: 0 },
  };

  const byKey = new Map(db.properties.map((p) => [propertyKey(p.name), p]));
  // Two distinct new names can slugify to the same base: keep primary keys unique.
  const usedIds = new Set(db.properties.map((p) => p.id));
  const uniqueId = (name: string): string => {
    const base = slug(name);
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    return id;
  };
  const withCosts = new Set(db.holding_costs.map((h) => h.property_id));

  // Properties first (FK parent). An existing property keeps its id, stored spelling
  // and active flag; CSV doesn't model activation (D-55).
  for (const p of batch.properties ?? []) {
    const existing = byKey.get(propertyKey(p.name));
    const fields = {
      address: p.address,
      type: p.type,
      size_m2: p.size_m2,
      garage: p.garage === null ? null : p.garage ? 1 : 0,
      purchase_date: p.purchase_date,
      purchase_price: p.purchase_price,
      appreciation_override_pa: p.appreciation_override_pa,
      rent_index_override_pa: p.rent_index_override_pa,
    };
    const row: PropertyRow = existing
      ? { ...existing, ...fields }
      : { id: uniqueId(p.name), name: p.name, ...fields, active: 1 };
    statements.push(
      existing
        ? updateStatement("properties", row.id, fields)
        : insertStatement("properties", row),
    );
    put(db.properties, row);
    byKey.set(propertyKey(p.name), row);
    usedIds.add(row.id);
    origin.set(`property:${row.id}`, { file: "properties", row: p.line });
    // Every property gets a holding-costs row so the edit form works.
    if (!withCosts.has(row.id)) {
      const costs: HoldingCostRow = {
        id: `hc-${row.id}`,
        property_id: row.id,
        property_tax_yr: null,
        insurance_yr: null,
        mgmt_pct_rent: null,
        maint_pct_rent: null,
        svj_monthly: null,
        other_yr: null,
      };
      statements.push(insertStatement("holding_costs", costs));
      db.holding_costs.push(costs);
      withCosts.add(row.id);
    }
    report.upserted.properties++;
  }

  const resolve = (file: CsvFile, row: number, name: string) => {
    const id = byKey.get(propertyKey(name))?.id;
    if (!id)
      problems.push({
        file,
        row,
        field: "property_name",
        problem: { code: "unknownProperty", value: name },
      });
    return id;
  };

  /** Update the row with the same natural key, or insert a new one. */
  function upsertChild<R extends { id: string; property_id: string }>(
    table: "mortgage_blocks" | "valuations" | "leases",
    entity: ValidationEntity,
    rows: R[],
    match: (r: R) => boolean,
    fresh: R,
    fields: Partial<R>,
    at: { file: CsvFile; row: number },
  ): void {
    const existing = rows.find(match);
    // A stored row whose date was edited after an earlier import keeps the id generated
    // from its old date; suffix a fresh id instead of clashing on the key (DR-137).
    let id = fresh.id;
    for (let n = 2; rows.some((r) => r.id === id); n++) id = `${fresh.id}-${n}`;
    const row = existing ? { ...existing, ...fields } : { ...fresh, id };
    statements.push(
      existing
        ? updateStatement(table, row.id, fields)
        : insertStatement(table, row),
    );
    put(rows, row);
    origin.set(`${entity}:${row.id}`, at);
  }

  for (const m of batch.mortgages ?? []) {
    const propId = resolve("mortgages", m.line, m.property_name);
    if (!propId) continue;
    const fields: Partial<MortgageBlockRow> = {
      initial_principal: m.initial_principal,
      fixation_years: m.fixation_years,
      interest_rate_pa: m.interest_rate_pa,
      monthly_instalment: m.monthly_instalment,
      loan_term_years: m.loan_term_years,
      // Blank ⇒ keep the stored maturity (DR-129). Draws and the interest-only date
      // are not CSV columns, so they are never touched.
      ...(m.contract_maturity_date !== null && {
        contract_maturity_date: m.contract_maturity_date,
      }),
    };
    upsertChild(
      "mortgage_blocks",
      "mortgage",
      db.mortgage_blocks,
      (r) => r.property_id === propId && r.start_date === m.start_date,
      {
        id: `${propId}-csv-m-${m.start_date}`,
        property_id: propId,
        start_date: m.start_date,
        initial_principal: m.initial_principal,
        fixation_years: m.fixation_years,
        interest_rate_pa: m.interest_rate_pa,
        monthly_instalment: m.monthly_instalment,
        loan_term_years: m.loan_term_years,
        draws: null,
        interest_only_until: null,
        contract_maturity_date: m.contract_maturity_date,
      },
      fields,
      { file: "mortgages", row: m.line },
    );
    report.upserted.mortgage_blocks++;
  }

  for (const v of batch.valuations ?? []) {
    const propId = resolve("valuations", v.line, v.property_name);
    if (!propId) continue;
    const fields = { valid_to: v.valid_to, market_value: v.market_value };
    upsertChild(
      "valuations",
      "valuation",
      db.valuations,
      (r) => r.property_id === propId && r.valid_from === v.valid_from,
      {
        id: `${propId}-csv-v-${v.valid_from}`,
        property_id: propId,
        valid_from: v.valid_from,
        ...fields,
      },
      fields,
      { file: "valuations", row: v.line },
    );
    report.upserted.valuations++;
  }

  for (const r of batch.rents ?? []) {
    const propId = resolve("rents", r.line, r.property_name);
    if (!propId) continue;
    const fields = { end_date: r.end_date, monthly_rent: r.monthly_rent };
    upsertChild(
      "leases",
      "lease",
      db.leases,
      (l) => l.property_id === propId && l.start_date === r.start_date,
      {
        id: `${propId}-csv-r-${r.start_date}`,
        property_id: propId,
        start_date: r.start_date,
        ...fields,
      },
      fields,
      { file: "rents", row: r.line },
    );
    report.upserted.leases++;
  }

  if (problems.length === 0) {
    // The engine's input rules over the merged portfolio; only rows this import wrote
    // can be at fault (stored rows passed the same rules when they were saved).
    const merged = {
      properties: db.properties.map(rowToProperty),
      mortgages: db.mortgage_blocks.map(rowToMortgageBlock),
      valuations: db.valuations.map(rowToValuation),
      leases: db.leases.map(rowToLease),
      holdingCosts: db.holding_costs.map(rowToHoldingCost),
    };
    for (const e of validatePortfolio(merged)) {
      const at = origin.get(`${e.entity}:${e.id}`);
      if (at)
        problems.push({
          ...at,
          field: e.field ? snake(e.field) : "",
          problem: { code: "inputRule", rule: e.code },
        });
    }
  }
  return { statements, problems, report };
}

export async function importCsv(
  sql: Sql,
  batch: CsvImportBatch,
): Promise<CsvImportReport> {
  const plan = planImport(batch, await readTables(sql));
  if (plan.problems.length > 0) throw new CsvImportError(plan.problems);

  await sql.transaction(plan.statements);
  return plan.report;
}
