// Typed repositories over the `Sql` seam. Writes take DB row objects (produced by the
// mappers); reads return engine inputs. The engine never imports this file.
import type { ExecuteResult, Sql, SqlStatement } from "./sql";
import { DataError } from "./errors";
import type {
  Portfolio,
  Assumptions,
  Scenario,
  Valuation,
  Lease,
  MortgageBlock,
  HoldingCost,
} from "../engine";
import {
  rowToProperty,
  rowToMortgageBlock,
  rowToValuation,
  rowToLease,
  rowToHoldingCost,
  rowToAssumptions,
  rowToScenario,
  assumptionsToRow,
  valuationToRow,
  leaseToRow,
  mortgageBlockToRow,
  holdingCostToRow,
  type PropertyRow,
  type MortgageBlockRow,
  type ValuationRow,
  type LeaseRow,
  type HoldingCostRow,
  type AssumptionsRow,
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

export const insertProperty = (sql: Sql, r: PropertyRow) =>
  insertRow(sql, "properties", r);
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

/** Generic UPDATE … SET col=? … WHERE id=? from a row object's own keys (id excluded). */
function updateStatement(table: string, row: { id: string }): SqlStatement {
  const entries = Object.entries(row).filter(([k]) => k !== "id");
  const assignments = entries.map(([k]) => `${k} = ?`).join(", ");
  return {
    query: `UPDATE ${table} SET ${assignments} WHERE id = ?`,
    params: [...entries.map(([, v]) => v), row.id],
  };
}

async function updateRow(
  sql: Sql,
  table: string,
  row: { id: string },
): Promise<void> {
  const { query, params } = updateStatement(table, row);
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

/** A new valuation plus the end date of the open-ended one it succeeds, in one
 *  transaction (ADR 0099). */
export const insertValuationClosingPrevious = (
  sql: Sql,
  v: Valuation,
  closedPrev: Valuation,
) =>
  sql.transaction([
    insertStatement("valuations", valuationToRow(v)),
    updateStatement("valuations", valuationToRow(closedPrev)),
  ]);
/** A new lease plus the end date of the open-ended one it succeeds (ADR 0099). */
export const insertLeaseClosingPrevious = (
  sql: Sql,
  l: Lease,
  closedPrev: Lease,
) =>
  sql.transaction([
    insertStatement("leases", leaseToRow(l)),
    updateStatement("leases", leaseToRow(closedPrev)),
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
): Promise<{ address: string | null; garage: boolean | null }> {
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

/** All saved scenarios, oldest first. */
export async function listScenarios(sql: Sql): Promise<Scenario[]> {
  const rows = await sql.select<ScenarioRow>(SCENARIOS_QUERY);
  return rows.map(rowToScenario);
}

/** Upsert a scenario by `id` (rename + duplicate both rely on id-keying). On update
 *  only name + overrides change — `created_at` is preserved. */
export async function upsertScenario(sql: Sql, r: ScenarioRow): Promise<void> {
  const existing = await sql.select<{ id: string }>(
    "SELECT id FROM scenarios WHERE id = ?",
    [r.id],
  );
  if (existing.length > 0) {
    await sql.execute(
      "UPDATE scenarios SET name = ?, overrides = ? WHERE id = ?",
      [r.name, r.overrides, r.id],
    );
  } else {
    await insertRow(sql, "scenarios", r);
  }
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

// The reads behind a full load, in the order `loadState` maps them.
const PORTFOLIO_QUERIES = [
  "SELECT * FROM properties ORDER BY id",
  "SELECT * FROM mortgage_blocks ORDER BY start_date, id",
  "SELECT * FROM valuations ORDER BY valid_from, id",
  "SELECT * FROM leases ORDER BY start_date, id",
  "SELECT * FROM holding_costs ORDER BY id",
] as const;
const ASSUMPTIONS_QUERY = "SELECT * FROM assumptions WHERE id = 1";
// Creation order (DR-181): older yyyy-mm-dd rows sort before same-day timestamps, by id.
const SCENARIOS_QUERY = "SELECT * FROM scenarios ORDER BY created_at, id";

// Properties are listed by name in Czech order, numbers by value (ADR 0127: ids are random).
// The sort is stable, so the query's id order breaks ties.
const byName = new Intl.Collator("cs", { numeric: true }).compare;

function toPortfolio([
  properties,
  mortgages,
  valuations,
  leases,
  holdingCosts,
]: unknown[][]): Portfolio {
  return {
    properties: (properties as PropertyRow[])
      .map(rowToProperty)
      .sort((a, b) => byName(a.name, b.name)),
    mortgages: (mortgages as MortgageBlockRow[]).map(rowToMortgageBlock),
    valuations: (valuations as ValuationRow[]).map(rowToValuation),
    leases: (leases as LeaseRow[]).map(rowToLease),
    holdingCosts: (holdingCosts as HoldingCostRow[]).map(rowToHoldingCost),
  };
}

function toAssumptions(rows: unknown[]): Assumptions {
  if (rows.length === 0) throw new Error("assumptions row not found (id = 1)");
  return rowToAssumptions(rows[0] as AssumptionsRow);
}

/** Load the whole portfolio and map each row to its engine input type. */
export async function loadPortfolio(sql: Sql): Promise<Portfolio> {
  return toPortfolio(
    await Promise.all(PORTFOLIO_QUERIES.map((q) => sql.select(q))),
  );
}

export async function loadAssumptions(sql: Sql): Promise<Assumptions> {
  return toAssumptions(await sql.select(ASSUMPTIONS_QUERY));
}

/** The first-run sample portfolio (ADR 0094): its fixed property IDs and the `app_meta`
 *  keys that mark it as active and its banner as dismissed. */
export const SAMPLE_PROPERTY_IDS = ["javorova", "lipova", "dubova"] as const;
export const SAMPLE_ACTIVE = "sample_active";
export const SAMPLE_DISMISSED = "sample_banner_dismissed";
const SAMPLE_META_QUERY = `SELECT key FROM app_meta WHERE key IN ('${SAMPLE_ACTIVE}', '${SAMPLE_DISMISSED}')`;

/** Whether the sample is still in place (marker set and at least one sample property
 *  left) and whether its banner was dismissed (ADR 0094). */
export interface SampleState {
  active: boolean;
  dismissed: boolean;
}

function toSample(keys: unknown[], portfolio: Portfolio): SampleState {
  const set = new Set((keys as { key: string }[]).map((r) => r.key));
  const ids: readonly string[] = SAMPLE_PROPERTY_IDS;
  return {
    active:
      set.has(SAMPLE_ACTIVE) &&
      portfolio.properties.some((p) => ids.includes(p.id)),
    dismissed: set.has(SAMPLE_DISMISSED),
  };
}

/** Backup recency (ADR 0110): the last recorded export and whether the data changed
 *  since. App state in `app_meta`, so never part of a backup or a restore. */
export const LAST_BACKUP_AT = "last_backup_at";
export const LAST_BACKUP_FILE = "last_backup_file";
export const CHANGED_SINCE_BACKUP = "changed_since_backup";
const BACKUP_META_QUERY = `SELECT key, value FROM app_meta WHERE key IN ('${LAST_BACKUP_AT}', '${LAST_BACKUP_FILE}', '${CHANGED_SINCE_BACKUP}')`;

export interface BackupState {
  /** ISO UTC timestamp of the last successful export, or null. */
  lastAt: string | null;
  /** Its file name (no path), or null. */
  lastFile: string | null;
  changedSince: boolean;
}

function toBackupState(rows: unknown[]): BackupState {
  const meta = new Map(
    (rows as { key: string; value: string }[]).map((r) => [r.key, r.value]),
  );
  return {
    lastAt: meta.get(LAST_BACKUP_AT) ?? null,
    lastFile: meta.get(LAST_BACKUP_FILE) ?? null,
    changedSince: meta.has(CHANGED_SINCE_BACKUP),
  };
}

/** Record a successful export (ADR 0110): `at` comes from the caller, never the clock.
 *  `clearChanged: false` keeps the changed flag, for a write that landed after the
 *  exported snapshot was read. */
export async function recordBackup(
  sql: Sql,
  at: string,
  file: string,
  clearChanged = true,
): Promise<void> {
  const upsert =
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  await sql.transaction([
    { query: upsert, params: [LAST_BACKUP_AT, at] },
    { query: upsert, params: [LAST_BACKUP_FILE, file] },
    ...(clearChanged
      ? [
          {
            query: "DELETE FROM app_meta WHERE key = ?",
            params: [CHANGED_SINCE_BACKUP],
          },
        ]
      : []),
  ]);
}

/** Mark the data as changed since the last backup (ADR 0110). */
export async function markDataChanged(sql: Sql): Promise<void> {
  await sql.execute(
    "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')",
    [CHANGED_SINCE_BACKUP],
  );
}

/** A stored scenario row the app cannot read: left out and listed for deletion. */
export interface UnreadableScenario {
  id: string;
  name: string;
}

/** Everything the app shows, as one point-in-time snapshot (DR-134). */
export interface LoadedState {
  portfolio: Portfolio;
  assumptions: Assumptions;
  scenarios: Scenario[];
  /** Scenario rows the app cannot read (ADR 0123): the rest of the app still loads. */
  unreadableScenarios: UnreadableScenario[];
  sample: SampleState;
  backup: BackupState;
}

/** `loadPortfolio` + `loadAssumptions` + `listScenarios` + the sample and backup state, read in one snapshot so a
 *  write landing mid-load cannot mix states (DR-134). */
export async function loadState(sql: Sql): Promise<LoadedState> {
  const results = await sql.selectSnapshot(
    [
      ...PORTFOLIO_QUERIES,
      ASSUMPTIONS_QUERY,
      SCENARIOS_QUERY,
      SAMPLE_META_QUERY,
      BACKUP_META_QUERY,
    ].map((query) => ({ query })),
  );
  const n = PORTFOLIO_QUERIES.length;
  const portfolio = toPortfolio(results.slice(0, n));
  // A scenario is a what-if on top of the portfolio: one the app cannot read is left out
  // and listed, not a reason to refuse the whole load (ADR 0123). Other tables stay strict.
  const scenarios: Scenario[] = [];
  const unreadableScenarios: UnreadableScenario[] = [];
  for (const r of (results[n + 1] ?? []) as unknown as ScenarioRow[]) {
    try {
      scenarios.push(rowToScenario(r));
    } catch (e) {
      if (!(e instanceof DataError)) throw e;
      unreadableScenarios.push({ id: r.id, name: String(r.name) });
    }
  }
  return {
    portfolio,
    assumptions: toAssumptions(results[n] ?? []),
    scenarios,
    unreadableScenarios,
    sample: toSample(results[n + 2] ?? [], portfolio),
    backup: toBackupState(results[n + 3] ?? []),
  };
}
