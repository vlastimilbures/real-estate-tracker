// DB access for CSV import. Distinct from csv.ts (pure parse) and plan.ts (the pure
// plan) so each is testable.
//
// All or nothing: the current rows are read once, every property name is
// resolved (ADR 0049) and the merged result is checked against the engine's input
// rules BEFORE anything is written. The write is then a single `Sql.transaction`
// (ADR 0014): every statement commits, or none does.
//
// ADR 0096: `planImport` classifies each row as add / update / unchanged. The preview
// and the commit share it; the commit writes the plan it builds at the click, and
// writes nothing when that plan has problems (ADR 0229).
import type { Sql } from "../data/sql";
import type {
  AssumptionsRow,
  HoldingCostRow,
  LeaseRow,
  MortgageBlockRow,
  PropertyRow,
  ValuationRow,
} from "../data/mappers";
import {
  planImport,
  type CsvImportBatch,
  type CsvImportPreview,
  type ImportItem,
  type ImportPlan,
  type ImportTables,
} from "./plan";

export { planImport };
export type {
  CsvFile,
  CsvImportBatch,
  CsvImportPreview,
  CsvImportProblem,
  CsvImportProblemCode,
  FieldChange,
  ImportItem,
} from "./plan";
import { newId } from "../lib/newId";

/** What an import wrote: one item per CSV row, as the preview showed it. */
export interface CsvImportReport {
  items: ImportItem[];
}

/** The plan built at the click has problems; nothing was written. The page shows them
 *  as the preview does (ADR 0229 §2, ADR 0185 §6). */
export class CsvImportProblemsError extends Error {
  readonly preview: CsvImportPreview;
  constructor(preview: CsvImportPreview) {
    super("CSV import refused: the plan has problems.");
    this.name = "CsvImportProblemsError";
    this.preview = preview;
  }
}

async function readTables(sql: Sql): Promise<ImportTables> {
  const [properties, mortgage_blocks, valuations, leases, holding_costs, a] =
    await Promise.all([
      sql.select<PropertyRow>("SELECT * FROM properties ORDER BY id"),
      sql.select<MortgageBlockRow>("SELECT * FROM mortgage_blocks ORDER BY id"),
      sql.select<ValuationRow>("SELECT * FROM valuations ORDER BY id"),
      sql.select<LeaseRow>("SELECT * FROM leases ORDER BY id"),
      sql.select<HoldingCostRow>("SELECT * FROM holding_costs ORDER BY id"),
      sql.select<AssumptionsRow>("SELECT * FROM assumptions WHERE id = 1"),
    ]);
  return {
    properties,
    mortgage_blocks,
    valuations,
    leases,
    holding_costs,
    assumptions: a[0],
  };
}

/** New property ids for one plan (ADR 0127): one random id per new name, so every row
 *  that names that property gets it. Each plan makes its own (ADR 0229 §3). */
function newIds(): (key: string) => string {
  const known = new Map<string, string>();
  return (key) => {
    let id = known.get(key);
    if (id === undefined) known.set(key, (id = newId()));
    return id;
  };
}

const previewOf = (plan: ImportPlan): CsvImportPreview => ({
  items: plan.items,
  problems: plan.problems,
});

/** The plan for `batch` against the stored data. Reads only; never writes. */
export async function previewImport(
  sql: Sql,
  batch: CsvImportBatch,
): Promise<CsvImportPreview> {
  return previewOf(planImport(batch, await readTables(sql), newIds()));
}

/** Write the plan for `batch`, built now against the stored data, in one transaction
 *  (ADR 0229 §1). A plan with problems writes nothing: refuse with
 *  `CsvImportProblemsError` (ADR 0229 §2). */
export async function importCsv(
  sql: Sql,
  batch: CsvImportBatch,
): Promise<CsvImportReport> {
  const plan = planImport(batch, await readTables(sql), newIds());
  // The page imports only a preview without problems, so a problem here means the data
  // changed since: refuse and show the problems as the preview does (ADR 0185 §6).
  if (plan.problems.length > 0)
    throw new CsvImportProblemsError(previewOf(plan));

  await sql.transaction(plan.statements);
  return { items: plan.items };
}
