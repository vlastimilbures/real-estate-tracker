// Typed repositories over the `Sql` seam: the record writes and the reads besides the full
// load (loadState.ts). The app's own flags live in appMeta.ts. The engine never imports
// this file.
//
// One write convention (#471): every write takes engine values (domain objects), maps them
// to rows here and only here, builds its statements, and hands them to `run`. Reads return
// engine inputs.
import type { Sql, SqlStatement } from "./sql";
import { DataError } from "./errors";
import { loadState } from "./loadState";
import { LAST_BACKUP_AT, markDataChanged, recordBackup } from "./appMeta";
import type {
  StoredAssumptions,
  Property,
  Scenario,
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
  propertyToRow,
  scenarioToRow,
  type PropertyExtras,
  type PropertyRow,
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
export function insertStatement(
  table: string,
  row: object,
): Required<SqlStatement> {
  const entries = Object.entries(row);
  const cols = entries.map(([k]) => k);
  const placeholders = cols.map(() => "?").join(", ");
  return {
    query: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
    params: entries.map(([, v]) => v),
  };
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

// --- running a write -------------------------------------------------------------

/** One write: its statements, in order, and for an update or delete by id the row it
 *  must hit. */
interface Write {
  statements: SqlStatement[];
  /** An update/delete by id must hit its row; zero rows means it no longer exists
   *  (DR-082) — an error, not a silent success. */
  target?: { table: string; id: string };
}

/** Run `write`: a single statement through `execute`, several through `transaction`, so
 *  they all commit or none does (D-14). */
async function run(sql: Sql, { statements, target }: Write): Promise<void> {
  const [only, ...rest] = statements;
  if (!only || rest.length > 0) {
    await sql.transaction(statements);
    return;
  }
  const { rowsAffected } = await sql.execute(only.query, only.params);
  if (target && rowsAffected === 0) {
    const ref = `${target.table} ${target.id}`;
    throw new DataError("ROW_MISSING", `The record no longer exists: ${ref}.`, [
      ref,
    ]);
  }
}

const insert = (table: string, row: object): Write => ({
  statements: [insertStatement(table, row)],
});

/** UPDATE of every column of a row object (id excluded), which must hit its row. */
const update = (table: string, { id, ...values }: { id: string }): Write => ({
  statements: [updateStatement(table, id, values)],
  target: { table, id },
});

const deleteById = (sql: Sql, table: string, id: string) =>
  run(sql, {
    statements: [{ query: `DELETE FROM ${table} WHERE id = ?`, params: [id] }],
    target: { table, id },
  });

// --- inserts -------------------------------------------------------------------

export const insertMortgageBlock = async (sql: Sql, m: MortgageBlock) =>
  run(sql, insert("mortgage_blocks", mortgageBlockToRow(m)));
export const insertValuation = async (sql: Sql, v: Valuation) =>
  run(sql, insert("valuations", valuationToRow(v)));
export const insertLease = async (sql: Sql, l: Lease) =>
  run(sql, insert("leases", leaseToRow(l)));

/** A new property and its holding-costs row, in one transaction. */
export const insertPropertyWithCosts = async (
  sql: Sql,
  p: Property,
  extra: PropertyExtras,
  costs: HoldingCost,
) =>
  run(sql, {
    statements: [
      insertStatement("properties", propertyToRow(p, extra)),
      insertStatement("holding_costs", holdingCostToRow(costs)),
    ],
  });

// --- updates (used by the edit forms) ------------------------------------------

export const updateValuation = async (sql: Sql, v: Valuation) =>
  run(sql, update("valuations", valuationToRow(v)));
export const updateLease = async (sql: Sql, l: Lease) =>
  run(sql, update("leases", leaseToRow(l)));
export const updateMortgageBlock = async (sql: Sql, m: MortgageBlock) =>
  run(sql, update("mortgage_blocks", mortgageBlockToRow(m)));

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
export const insertValuationClosingPrevious = async (
  sql: Sql,
  v: Valuation,
  closedPrev: Valuation,
) =>
  run(sql, {
    statements: [
      insertStatement("valuations", valuationToRow(v)),
      closeStatement(
        "valuations",
        "valid_to",
        closedPrev.id,
        valuationToRow(closedPrev).valid_to,
      ),
    ],
  });
/** A new lease plus the end date of the open-ended one it succeeds (ADR 0099). */
export const insertLeaseClosingPrevious = async (
  sql: Sql,
  l: Lease,
  closedPrev: Lease,
) =>
  run(sql, {
    statements: [
      insertStatement("leases", leaseToRow(l)),
      closeStatement(
        "leases",
        "end_date",
        closedPrev.id,
        leaseToRow(closedPrev).end_date,
      ),
    ],
  });

/** Save a property's holding costs: one row per property (UNIQUE property_id, v7).
 *  Inserts the row when the property has none, so an edit is never silently lost. */
export async function upsertHoldingCost(
  sql: Sql,
  h: HoldingCost,
): Promise<void> {
  const row = holdingCostToRow(h);
  const { query, params } = insertStatement("holding_costs", row);
  const values = Object.keys(row)
    .filter((k) => k !== "id" && k !== "property_id")
    .map((k) => `${k} = excluded.${k}`)
    .join(", ");
  await run(sql, {
    statements: [
      {
        query: `${query} ON CONFLICT(property_id) DO UPDATE SET ${values}`,
        params,
      },
    ],
  });
}

/** Every stored column of the property, `extra` included (ADR 0184 §3). */
export const updateProperty = async (
  sql: Sql,
  p: Property,
  extra: PropertyExtras,
) => run(sql, update("properties", propertyToRow(p, extra)));

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
export const setPropertyActive = async (
  sql: Sql,
  id: string,
  active: boolean,
) =>
  run(sql, {
    statements: [
      {
        query: "UPDATE properties SET active = ? WHERE id = ?",
        params: [active ? 1 : 0, id],
      },
    ],
    target: { table: "properties", id },
  });

// --- deletes by id (child rows) ------------------------------------------------

export const deleteValuation = (sql: Sql, id: string) =>
  deleteById(sql, "valuations", id);
export const deleteLease = (sql: Sql, id: string) =>
  deleteById(sql, "leases", id);
export const deleteMortgageBlock = (sql: Sql, id: string) =>
  deleteById(sql, "mortgage_blocks", id);

/** Upsert the single assumptions row (id = 1), in one transaction. */
export const upsertAssumptions = async (sql: Sql, a: StoredAssumptions) =>
  run(sql, {
    statements: [
      { query: "DELETE FROM assumptions WHERE id = 1" },
      insertStatement("assumptions", assumptionsToRow(a)),
    ],
  });

// --- scenarios (what-if overrides; not part of Portfolio) ----------------------

/** Upsert a scenario by `id` (rename + duplicate both rely on id-keying). `createdAt` is
 *  the time of the write: an insert stores it; on update only name + overrides change,
 *  so the stored `created_at` is preserved (ADR 0123). */
export async function upsertScenario(
  sql: Sql,
  s: Scenario,
  createdAt: Date,
): Promise<void> {
  const { query, params } = insertStatement(
    "scenarios",
    scenarioToRow(s, createdAt),
  );
  await run(sql, {
    statements: [
      {
        query: `${query} ON CONFLICT(id) DO UPDATE SET name = excluded.name, overrides = excluded.overrides`,
        params,
      },
    ],
  });
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
