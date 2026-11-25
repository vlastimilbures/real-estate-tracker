// Typed repositories over the `Sql` seam: the record writes and the reads besides the full
// load (loadState.ts). The app's own flags live in appMeta.ts. Writes take DB row objects
// (produced by the mappers); reads return engine inputs. The engine never imports this
// file.
import type { ExecuteResult, Sql, SqlStatement } from "./sql";
import { DataError } from "./errors";
import { loadState } from "./loadState";
import { LAST_BACKUP_AT, markDataChanged, recordBackup } from "./appMeta";
import type {
  Assumptions,
  Valuation,
  Lease,
  MortgageBlock,
  HoldingCost,
} from "../engine";
import {
  assumptionsToRow,
  valuationToRow,
  leaseToRow,
  mortgageBlockToRow,
  holdingCostToRow,
  type PropertyExtras,
  type PropertyRow,
  type MortgageBlockRow,
  type ValuationRow,
  type LeaseRow,
  type HoldingCostRow,
  type ScenarioRow,
} from "./mappers";

// The six portfolio tables, in FK-safe insert order (properties first).
export const PORTFOLIO_TABLES = [
  "properties",
  "mortgage_blocks",
  "valuations",
  "leases",
  "holding_costs",
] as const;

/** Generic positional INSERT from a row object's own keys. */
export function insertStatement(table: string, row: object): SqlStatement {
  const entries = Object.entries(row);
  const cols = entries.map(([k]) => k);
  const placeholders = cols.map(() => "?").join(", ");
  return {
    query: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
    params: entries.map(([, v]) => v),
  };
}

async function insertRow(sql: Sql, table: string, row: object): Promise<void> {
  const { query, params } = insertStatement(table, row);
  await sql.execute(query, params);
}

// --- inserts (row-level, used by the store and tests) ----------------------------

export const insertMortgageBlock = (sql: Sql, r: MortgageBlockRow) =>
  insertRow(sql, "mortgage_blocks", r);
export const insertValuation = (sql: Sql, r: ValuationRow) =>
  insertRow(sql, "valuations", r);
export const insertLease = (sql: Sql, r: LeaseRow) =>
  insertRow(sql, "leases", r);

/** A new property and its holding-costs row, in one transaction. */
export const insertPropertyWithCosts = (
  sql: Sql,
  property: PropertyRow,
  costs: HoldingCostRow,
) =>
  sql.transaction([
    insertStatement("properties", property),
    insertStatement("holding_costs", costs),
  ]);

// --- updates (row-level, used by the edit forms) -------------------------------

/** An update/delete by id must hit its row; zero rows means it no longer exists
 *  (DR-082) — an error, not a silent success. */
async function byId(
  table: string,
  id: string,
  write: Promise<ExecuteResult>,
): Promise<void> {
  const { rowsAffected } = await write;
  if (rowsAffected === 0) {
    throw new DataError(
      "ROW_MISSING",
      `The record no longer exists: ${table} ${id}.`,
      [`${table} ${id}`],
    );
  }
}

/** UPDATE `table` SET <only these columns> WHERE id = ? — columns not in `values` are
 *  left as stored. */
export function updateStatement(
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

/** UPDATE of every column of a row object (id excluded). */
const rowUpdate = (table: string, { id, ...values }: { id: string }) =>
  updateStatement(table, id, values);

async function updateRow(
  sql: Sql,
  table: string,
  row: { id: string },
): Promise<void> {
  const { query, params } = rowUpdate(table, row);
  await byId(table, row.id, sql.execute(query, params));
}

const deleteById = (sql: Sql, table: string, id: string) =>
  byId(table, id, sql.execute(`DELETE FROM ${table} WHERE id = ?`, [id]));

export const updateValuation = (sql: Sql, v: Valuation) =>
  updateRow(sql, "valuations", valuationToRow(v));
export const updateLease = (sql: Sql, l: Lease) =>
  updateRow(sql, "leases", leaseToRow(l));
export const updateMortgageBlock = (sql: Sql, m: MortgageBlock) =>
  updateRow(sql, "mortgage_blocks", mortgageBlockToRow(m));

/** Ends an open record: only its end column, only while it is still open (ADR 0184 §2),
 *  so a correction saved after the caller took its copy is kept. A row deleted meanwhile
 *  changes nothing and is not reported (a documented limit). */
const closeStatement = (
  table: string,
  column: string,
  id: string,
  end: string | null,
): SqlStatement => ({
  query: `UPDATE ${table} SET ${column} = ? WHERE id = ? AND ${column} IS NULL`,
  params: [end, id],
});

/** A new valuation plus the end date of the open-ended one it succeeds, in one
 *  transaction (ADR 0099, 0227). */
export const insertValuationClosingPrevious = (
  sql: Sql,
  v: Valuation,
  closedPrev: Valuation,
) =>
  sql.transaction([
    insertStatement("valuations", valuationToRow(v)),
    closeStatement(
      "valuations",
      "valid_to",
      closedPrev.id,
      valuationToRow(closedPrev).valid_to,
    ),
  ]);
/** A new lease plus the end date of the open-ended one it succeeds (ADR 0099). */
export const insertLeaseClosingPrevious = (
  sql: Sql,
  l: Lease,
  closedPrev: Lease,
) =>
  sql.transaction([
    insertStatement("leases", leaseToRow(l)),
    closeStatement(
      "leases",
      "end_date",
      closedPrev.id,
      leaseToRow(closedPrev).end_date,
    ),
  ]);
/** Save a property's holding costs: one row per property (UNIQUE property_id, v7).
 *  Inserts the row when the property has none, so an edit is never silently lost. */
export async function updateHoldingCost(
  sql: Sql,
  h: HoldingCost,
): Promise<void> {
  const { query, params } = insertStatement(
    "holding_costs",
    holdingCostToRow(h),
  );
  const values = Object.keys(holdingCostToRow(h))
    .filter((k) => k !== "id" && k !== "property_id")
    .map((k) => `${k} = excluded.${k}`)
    .join(", ");
  await sql.execute(
    `${query} ON CONFLICT(property_id) DO UPDATE SET ${values}`,
    params,
  );
}

export const updateProperty = (sql: Sql, r: PropertyRow) =>
  updateRow(sql, "properties", r);

/** Address/garage are persisted for fidelity but dropped by `rowToProperty` (not
 *  engine inputs) — this is their only read path, used to prefill the edit form. */
export async function getPropertyExtras(
  sql: Sql,
  id: string,
): Promise<PropertyExtras> {
  const rows = await sql.select<Pick<PropertyRow, "address" | "garage">>(
    "SELECT address, garage FROM properties WHERE id = ?",
    [id],
  );
  return rows[0]
    ? {
        address: rows[0].address,
        garage: rows[0].garage == null ? null : !!rows[0].garage,
      }
    : { address: null, garage: null };
}

/**
 * Toggle a property's active flag without round-tripping the whole row — a full
 * `updateProperty` would null the address/garage columns that `rowToProperty` drops.
 */
export const setPropertyActive = (sql: Sql, id: string, active: boolean) =>
  byId(
    "properties",
    id,
    sql.execute("UPDATE properties SET active = ? WHERE id = ?", [
      active ? 1 : 0,
      id,
    ]),
  );

// --- deletes by id (child rows) ------------------------------------------------

export const deleteValuation = (sql: Sql, id: string) =>
  deleteById(sql, "valuations", id);
export const deleteLease = (sql: Sql, id: string) =>
  deleteById(sql, "leases", id);
export const deleteMortgageBlock = (sql: Sql, id: string) =>
  deleteById(sql, "mortgage_blocks", id);

/** Upsert the single assumptions row (id = 1), in one transaction. */
export async function upsertAssumptions(
  sql: Sql,
  a: Assumptions,
): Promise<void> {
  await sql.transaction([
    { query: "DELETE FROM assumptions WHERE id = 1" },
    insertStatement("assumptions", assumptionsToRow(a)),
  ]);
}

// --- scenarios (what-if overrides; not part of Portfolio) ----------------------

/** Upsert a scenario by `id` (rename + duplicate both rely on id-keying). On update
 *  only name + overrides change — `created_at` is preserved. */
export async function upsertScenario(sql: Sql, r: ScenarioRow): Promise<void> {
  const { query, params } = insertStatement("scenarios", r);
  await sql.execute(
    `${query} ON CONFLICT(id) DO UPDATE SET name = excluded.name, overrides = excluded.overrides`,
    params,
  );
}

export const deleteScenario = (sql: Sql, id: string) =>
  deleteById(sql, "scenarios", id);

// --- deletes -------------------------------------------------------------------

export const deleteProperty = (sql: Sql, id: string) =>
  deleteById(sql, "properties", id); // cascades to children

// --- reads ---------------------------------------------------------------------

export async function countProperties(sql: Sql): Promise<number> {
  const rows = await sql.select<{ n: number }>(
    "SELECT COUNT(*) AS n FROM properties",
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * The full load and the backup-recency writers, kept on this path for the backup, restore
 * and migration tests, which import them from here unchanged (#471). The app imports
 * loadState.ts and appMeta.ts.
 * @internal
 */
export { loadState, LAST_BACKUP_AT, markDataChanged, recordBackup };
