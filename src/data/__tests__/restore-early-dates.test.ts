// ADR 0149 §5 (#119 item 5): new dates start on 01.01.1900, stored ones only warn. The
// database guard checks shape only, so a database that already holds an earlier date
// keeps loading; restore asks about it ("Restore anyway") like an out-of-range number
// (ADR 0148 §1), so the app's own export of that database restores.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadState } from "../repositories";
import {
  confirmRestore,
  exportToJson,
  prepareRestore,
  RestoreError,
} from "../backup";
import { checkInputRules } from "../../import/inputRules";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string, args: { json: string }) =>
    command === "write_app_backup"
      ? Promise.resolve(args.json)
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
      "UPDATE properties SET purchase_date = '1850-01-01' WHERE id = 'javorova'",
    )
    .run();
});

afterEach(() => sql.db.close());

describe("stored dates before 1900 (ADR 0149 §5)", () => {
  it("load: the database still loads", async () => {
    const { portfolio } = await loadState(sql);
    const p = portfolio.properties.find((x) => x.id === "javorova");
    expect(p?.purchaseDate.toISOString().slice(0, 10)).toBe("1850-01-01");
  });

  it("restore: the app's own export restores with an EARLY_DATE warning (#119)", async () => {
    const backup = await exportToJson(sql);
    expect(prepareRestore(backup, checkInputRules).warnings).toEqual([
      {
        table: "properties",
        id: "javorova",
        column: "purchase_date",
        rule: "EARLY_DATE",
      },
    ]);
  });

  it("restore: confirming replaces the data", async () => {
    const backup = await exportToJson(sql);
    await confirmRestore(sql, backup, checkInputRules);
    const { portfolio } = await loadState(sql);
    expect(portfolio.properties).toHaveLength(3);
  });

  it("restore: a refused file lists its early dates too (#119)", async () => {
    const backup = await exportToJson(sql);
    const leases = (backup.tables.leases as Record<string, unknown>[]).map(
      (r, i) => (i === 0 ? { ...r, monthly_rent: "-1" } : r),
    );
    let e: unknown = null;
    try {
      prepareRestore(
        { ...backup, tables: { ...backup.tables, leases } },
        checkInputRules,
      );
    } catch (err) {
      e = err;
    }
    expect(e).toBeInstanceOf(RestoreError);
    expect((e as RestoreError).issues.map((i) => i.rule)).toContain(
      "EARLY_DATE",
    );
  });
});
