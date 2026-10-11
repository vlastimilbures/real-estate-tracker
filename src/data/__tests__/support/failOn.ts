// Fault injection for the atomic-write tests (P5a step 1, H-07, D-14).
import type { TestSql } from "../betterSqlite";
import type { Sql } from "../../sql";

/** Wraps a Sql so that any statement matching `pattern` fails — whether it is sent on
 *  its own or inside a transaction (where it fails the whole transaction). */
export function failOn(inner: TestSql, pattern: RegExp): Sql {
  const boom = { query: "INSERT INTO no_such_table VALUES (1)" };
  return {
    execute: (q, p) =>
      pattern.test(q)
        ? Promise.reject(new Error("injected failure"))
        : inner.execute(q, p),
    select: (q, p) => inner.select(q, p),
    selectSnapshot: (statements) => inner.selectSnapshot(statements),
    transaction: (statements, options) =>
      inner.transaction(
        statements.map((s) => (pattern.test(s.query) ? boom : s)),
        options,
      ),
    backup: (label) => inner.backup(label),
  };
}
