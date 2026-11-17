// #464: every CHECK constraint in the migrated schema reads as a translated sentence, never
// the generic fallback. Read from the database itself, so a CHECK added by any migration,
// however it is written, is covered.
import { describe, it, expect, afterEach } from "vitest";
import { describeWriteError } from "../writeError";
import { getDict } from "../../../i18n";
import { migrate } from "../../../data/migrations";
import {
  openMemorySql,
  type TestSql,
} from "../../../data/__tests__/betterSqlite";

const en = getDict("en");
let sql: TestSql | undefined;

afterEach(() => sql?.db.close());

/** The name of every CHECK constraint in the schema `migrate` builds. */
async function schemaChecks(): Promise<string[]> {
  sql = openMemorySql();
  await migrate(sql);
  const rows = sql.db
    .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL")
    .all() as { sql: string }[];
  return rows.flatMap((r) =>
    [...r.sql.matchAll(/CONSTRAINT\s+"?(\w+)"?\s+CHECK/gi)].map((m) => m[1]!),
  );
}

describe("CHECK constraint messages (migrated schema)", () => {
  it("every CHECK in the schema has its own message", async () => {
    const names = await schemaChecks();
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) {
      const text = describeWriteError(en, {
        kind: "constraint",
        constraint: { kind: "check", check: name },
      });
      expect(text.message, name).not.toBe(en.writeErrors.otherConstraint);
      if (text.field !== undefined) expect(text.field, name).not.toBe("");
    }
  });
});
