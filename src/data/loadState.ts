// The full load: everything the app shows, read in one point-in-time snapshot
// and mapped to engine inputs. The engine never imports this file.
import type { Sql } from "./sql";
import { DataError } from "./errors";
import type { Portfolio, Assumptions, Scenario } from "../engine";
import {
  rowToProperty,
  rowToMortgageBlock,
  rowToValuation,
  rowToLease,
  rowToHoldingCost,
  rowToAssumptions,
  rowToScenario,
  type PropertyRow,
  type MortgageBlockRow,
  type ValuationRow,
  type LeaseRow,
  type HoldingCostRow,
  type AssumptionsRow,
  type ScenarioRow,
} from "./mappers";
import {
  BACKUP_META_QUERY,
  SAMPLE_META_QUERY,
  toBackupState,
  toSample,
  type BackupState,
  type SampleState,
} from "./appMeta";

// The reads behind a full load, in the order `loadState` maps them.
const PORTFOLIO_QUERIES = [
  "SELECT * FROM properties ORDER BY id",
  "SELECT * FROM mortgage_blocks ORDER BY start_date, id",
  "SELECT * FROM valuations ORDER BY valid_from, id",
  "SELECT * FROM leases ORDER BY start_date, id",
  "SELECT * FROM holding_costs ORDER BY id",
] as const;
const ASSUMPTIONS_QUERY = "SELECT * FROM assumptions WHERE id = 1";
// Creation order: older yyyy-mm-dd rows sort before same-day timestamps, by id.
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
  // A lost row is not re-created from the sample values: startup stops (ADR 0252).
  if (rows.length === 0)
    throw new DataError(
      "ROW_INVALID",
      "A saved record cannot be read: assumptions row not found (id = 1).",
      ["assumptions 1: row not found"],
    );
  return rowToAssumptions(rows[0] as AssumptionsRow);
}

/** Everything the app shows, as one point-in-time snapshot. */
export interface LoadedState {
  portfolio: Portfolio;
  assumptions: Assumptions;
  scenarios: Scenario[];
  sample: SampleState;
  backup: BackupState;
}

/** The portfolio, assumptions, scenarios and the sample and backup state, read in one
 *  snapshot so a write landing mid-load cannot mix states. */
export async function loadState(sql: Sql): Promise<LoadedState> {
  const results = await sql.selectSnapshot([
    ...[...PORTFOLIO_QUERIES, ASSUMPTIONS_QUERY, SCENARIOS_QUERY].map(
      (query) => ({ query }),
    ),
    SAMPLE_META_QUERY,
    BACKUP_META_QUERY,
  ]);
  const n = PORTFOLIO_QUERIES.length;
  const portfolio = toPortfolio(results.slice(0, n));
  return {
    portfolio,
    assumptions: toAssumptions(results[n] ?? []),
    // A scenario row the app cannot read stops the load like any other (ADR 0231).
    scenarios: ((results[n + 1] ?? []) as ScenarioRow[]).map(rowToScenario),
    sample: toSample(results[n + 2] ?? [], portfolio),
    backup: toBackupState(results[n + 3] ?? []),
  };
}
