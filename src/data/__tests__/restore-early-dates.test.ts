// ADR 0232 (#452): a date before 01.01.1900 is refused only where it is typed (the forms
// and CSV import). The database guard checks shape only, so a database that already holds
// an earlier date keeps loading, and its own export restores with no warning: the
// ordinary confirm step, no "Restore anyway".
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadState } from "../repositories";
import { confirmRestore, exportToJson, prepareRestore } from "../backup";
import { checkInputRules } from "../../import/inputRules";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string) =>
    command === "write_app_backup"
      ? Promise.resolve()
      : Promise.reject(new Error(`unexpected command ${command}`)),
  ),
}));

let sql: TestSql;

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  sql.db
    .prepare(
      "UPDATE properties SET purchase_date = '1899-12-31' WHERE id = 'javorova'",
    )
    .run();
});

afterEach(() => sql.db.close());

describe("stored dates before 1900 (ADR 0232)", () => {
  it("load: the database still loads", async () => {
    const { portfolio } = await loadState(sql);
    const p = portfolio.properties.find((x) => x.id === "javorova");
    expect(p?.purchaseDate.toISOString().slice(0, 10)).toBe("1899-12-31");
  });

  it("restore: the app's own export restores with no warning (#452)", async () => {
    const backup = await exportToJson(sql, new Date());
    expect(prepareRestore(backup, checkInputRules).warnings).toEqual([]);
  });

  it("restore: confirming replaces the data", async () => {
    const backup = await exportToJson(sql, new Date());
    await confirmRestore(sql, backup, checkInputRules);
    const { portfolio } = await loadState(sql);
    expect(portfolio.properties).toHaveLength(3);
  });
});
