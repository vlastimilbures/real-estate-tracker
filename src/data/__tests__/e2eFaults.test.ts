// The forced startup failures for ux:capture (#115, ADR 0153) are real ones: the data
// layer itself refuses the database, as it would on disk.
import { describe, it, expect } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadState } from "../repositories";
import { DataError } from "../errors";
import { afterSeed, beforeMigrate, e2eFault } from "../e2eFaults";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return (e as DataError).code;
  }
  throw new Error("expected a rejection");
}

describe("E2E startup faults", () => {
  it("DB_NEWER: migrate refuses the database", async () => {
    const sql = openMemorySql();
    await beforeMigrate(sql, "DB_NEWER");
    expect(await code(migrate(sql))).toBe("DB_NEWER");
  });

  it("ROW_INVALID: migrate and seed pass, loading refuses a row", async () => {
    const sql = openMemorySql();
    await beforeMigrate(sql, "ROW_INVALID");
    await migrate(sql);
    await seedIfEmpty(sql);
    await afterSeed(sql, "ROW_INVALID");
    expect(await code(loadState(sql))).toBe("ROW_INVALID");
  });

  it("no fault leaves the database alone", async () => {
    const sql = openMemorySql();
    await beforeMigrate(sql, null);
    await migrate(sql);
    await seedIfEmpty(sql);
    await afterSeed(sql, null);
    await loadState(sql);
  });

  it("there is no fault without a browser session", () => {
    expect(e2eFault()).toBeNull();
  });
});
