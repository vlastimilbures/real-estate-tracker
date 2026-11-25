// One point-in-time read with a count check (#471). A row list the adapter left out
// would read as an empty table, so a snapshot that returns fewer (or more) result sets
// than it was asked for is an error. `loadState` deliberately reads without this check:
// see src/data/__tests__/loadStateShortSnapshot.test.ts.
import type { Sql, SqlStatement } from "./sql";

/** A row as an adapter returns it: column name → value. The row readers' guards check its
 *  shape (guards.ts). */
export type Row = Record<string, unknown>;

/** Run the read-only `statements` as one snapshot (DR-134): one row list per statement,
 *  in order, or an error when the adapter returned another number of lists. */
export async function snapshot(
  sql: Sql,
  statements: SqlStatement[],
): Promise<Row[][]> {
  const results = await sql.selectSnapshot(statements);
  if (results.length !== statements.length)
    throw new Error(
      `the snapshot returned ${results.length} of ${statements.length} result sets`,
    );
  return results;
}
