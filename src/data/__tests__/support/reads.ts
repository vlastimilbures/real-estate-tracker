// Test shortcuts over the app's own data paths: reads go through `loadState` (the store's
// load) and a restore skips only the safety backup that `confirmRestore` writes first.
import type { Sql } from "../../sql";
import { insertStatement, loadState } from "../../repositories";
import { prepareRestore, type BackupFile, type InputRules } from "../../backup";
import type { PropertyRow } from "../../mappers";

export const loadPortfolio = async (sql: Sql) =>
  (await loadState(sql)).portfolio;
export const loadAssumptions = async (sql: Sql) =>
  (await loadState(sql)).assumptions;
export const listScenarios = async (sql: Sql) =>
  (await loadState(sql)).scenarios;

/** `confirmRestore` without the safety backup: check the file, replace every table. */
export async function restoreFromJson(
  sql: Sql,
  backup: BackupFile,
  rules: InputRules,
): Promise<void> {
  await sql.transaction(prepareRestore(backup, rules).statements);
}

export async function insertProperty(sql: Sql, r: PropertyRow): Promise<void> {
  const { query, params } = insertStatement("properties", r);
  await sql.execute(query, params);
}
