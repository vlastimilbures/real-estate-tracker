// ADR 0183: migration v11 adds assumptions.selling_cost_pct (TEXT NOT NULL DEFAULT '0',
// 0–1). Forward-only, on synthetic databases only: a fresh install and a v10 database
// with its assumptions row both read 0 (the owner's numbers do not change), a verified
// pre-migration copy is written first, a rate outside 0–1 is refused, and the mapper and
// a JSON backup carry the value.
import { describe, it, expect } from "vitest";
import DatabaseConstructor from "better-sqlite3";
import { openMemorySql } from "./betterSqlite";
import { schemaAt } from "./support/schemaAt";
import { migrate } from "../migrations";
import { upsertAssumptions } from "../repositories";
import { assumptionsToRow, rowToAssumptions } from "../mappers";
import { exportToJson, RestoreError } from "../backup";
import { checkInputRules } from "../../import/inputRules";
import { rate } from "../../engine";
import { SEED_ASSUMPTIONS as seedAssumptions } from "../seed";
import { loadAssumptions, restoreFromJson } from "./support/reads";

const NOW = () => new Date(Date.UTC(2026, 9, 11, 8, 0, 0));
const V10_ROW = `INSERT INTO assumptions VALUES (1, '2026-06-07', '0.04', '0.03', '0.05', '0.045', 30, '0.025', '2000', '3000', '0.15', '0.05', '1500', '0')`;

describe("migration v11 — selling costs (ADR 0183)", () => {
  it("a fresh install has the column, default 0", async () => {
    const sql = openMemorySql();
    await migrate(sql, { now: NOW });
    const info = await sql.select<{ name: string; dflt_value: string }>(
      "SELECT name, dflt_value FROM pragma_table_info('assumptions') WHERE name = 'selling_cost_pct'",
    );
    expect(info).toEqual([{ name: "selling_cost_pct", dflt_value: "'0'" }]);
    sql.db.close();
  });

  it("upgrades a v10 database: the row reads 0 and a verified copy comes first", async () => {
    const sql = await schemaAt(10);
    await sql.execute(V10_ROW);
    const before = await sql.select("SELECT * FROM assumptions");

    const result = await migrate(sql, { now: NOW });

    expect(result).toMatchObject({ from: 10, to: 11 });
    expect(result.backupPath).toMatch(
      /pre-migration-v10-to-v11-20261011T080000Z\.sqlite$/,
    );
    const copy = new DatabaseConstructor(result.backupPath!, {
      readonly: true,
    });
    expect(
      copy.prepare("SELECT MAX(version) AS v FROM schema_migrations").get(),
    ).toEqual({ v: 10 });
    copy.close();
    // Every existing value is kept; the new column reads 0.
    expect(await sql.select("SELECT * FROM assumptions")).toEqual([
      { ...before[0], selling_cost_pct: "0" },
    ]);
    expect((await loadAssumptions(sql)).sellingCostPct?.toString()).toBe("0");
    sql.db.close();
  });

  it.each(["1.5", "-0.01"])("the CHECK refuses %s", async (v) => {
    const sql = await schemaAt(10);
    await sql.execute(V10_ROW);
    await migrate(sql, { now: NOW });
    await expect(
      sql.execute("UPDATE assumptions SET selling_cost_pct = ?", [v]),
    ).rejects.toThrow("assumptions_selling_cost_0_to_1");
    sql.db.close();
  });

  it("stores and loads a rate exactly", async () => {
    const sql = openMemorySql();
    await migrate(sql, { now: NOW });
    await upsertAssumptions(sql, {
      ...seedAssumptions,
      sellingCostPct: rate("0.035"),
    });
    expect((await loadAssumptions(sql)).sellingCostPct?.toString()).toBe(
      "0.035",
    );
    sql.db.close();
  });

  it("a JSON backup round-trips the rate; one from before v11 restores 0", async () => {
    const sql = openMemorySql();
    await migrate(sql, { now: NOW });
    await upsertAssumptions(sql, {
      ...seedAssumptions,
      sellingCostPct: rate("0.04"),
    });
    const backup = await exportToJson(sql, NOW());
    expect(backup.tables.assumptions[0]).toMatchObject({
      selling_cost_pct: "0.04",
    });
    await restoreFromJson(sql, backup, checkInputRules);
    expect((await loadAssumptions(sql)).sellingCostPct?.toString()).toBe(
      "0.04",
    );

    const older = {
      ...backup,
      schemaVersion: 10,
      tables: {
        ...backup.tables,
        assumptions: backup.tables.assumptions.map((r) => {
          const rest = { ...r };
          delete rest.selling_cost_pct;
          return rest;
        }),
      },
    };
    await restoreFromJson(sql, older, checkInputRules);
    expect((await loadAssumptions(sql)).sellingCostPct?.toString()).toBe("0");
    sql.db.close();
  });
});

describe("restore — selling costs (ADR 0183)", () => {
  it("refuses a rate outside 0–1, naming the stored column", async () => {
    const sql = openMemorySql();
    await migrate(sql, { now: NOW });
    await upsertAssumptions(sql, seedAssumptions);
    const backup = await exportToJson(sql, NOW());
    const bad = {
      ...backup,
      tables: {
        ...backup.tables,
        assumptions: backup.tables.assumptions.map((r) => ({
          ...r,
          selling_cost_pct: "1.5",
        })),
      },
    };
    const e = await restoreFromJson(sql, bad, checkInputRules).catch(
      (err: unknown) => err,
    );
    expect(e).toBeInstanceOf(RestoreError);
    expect((e as RestoreError).issues).toContainEqual({
      table: "assumptions",
      column: "selling_cost_pct",
      rule: "RATE_OUT_OF_RANGE",
    });
    sql.db.close();
  });
});

describe("mapper — selling costs", () => {
  it("writes '0' when unset and reads it back as 0", () => {
    const row = assumptionsToRow(seedAssumptions);
    expect(row.selling_cost_pct).toBe("0");
    expect(rowToAssumptions(row).sellingCostPct?.toString()).toBe("0");
  });
});
