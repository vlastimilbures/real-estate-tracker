// Scenario mapper round-trip + repository (list / upsert-by-id / delete, created_at preserved).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { scenarioToRow, rowToScenario, type ScenarioRow } from "../mappers";
import { listScenarios, upsertScenario, deleteScenario } from "../repositories";
import { isoDate, rate } from "../../engine";
import type { Scenario } from "../../engine";

const sample: Scenario = {
  id: "s-1",
  name: "Recession",
  overrides: {
    appreciationPa: rate("0.01"),
    inflationPa: rate("0.05"),
    inflationShock: { deltaPa: rate("0.06"), durationYears: 3 },
    rateShock: { deltaPa: rate("0.04"), durationYears: 2 },
    valueShock: { pct: rate("0.2"), atYear: 5 },
  },
};
const created = isoDate("2026-06-08");

describe("scenario mapper round-trip", () => {
  it("scenarioToRow → rowToScenario is identity", () => {
    const back = rowToScenario(scenarioToRow(sample, created));
    expect(back.id).toBe(sample.id);
    expect(back.name).toBe(sample.name);
    expect(back.overrides.appreciationPa?.toString()).toBe("0.01");
    expect(back.overrides.inflationPa?.toString()).toBe("0.05");
    expect(back.overrides.inflationShock?.deltaPa.toString()).toBe("0.06");
    expect(back.overrides.inflationShock?.durationYears).toBe(3);
    expect(back.overrides.rateShock?.deltaPa.toString()).toBe("0.04");
    expect(back.overrides.rateShock?.durationYears).toBe(2);
    expect(back.overrides.valueShock?.pct.toString()).toBe("0.2");
    expect(back.overrides.valueShock?.atYear).toBe(5);
    // unset fields stay undefined (not serialized)
    expect(back.overrides.rentIndexationPa).toBeUndefined();
    expect(back.overrides.vacancyAllowance).toBeUndefined();
    expect(back.overrides.postFixationResetRatePa).toBeUndefined();
  });

  it("reads a legacy flat valueShockPct as a year-0 crash (back-compat)", () => {
    const legacy: ScenarioRow = {
      id: "old-1",
      name: "Old crash",
      overrides: JSON.stringify({ valueShockPct: "0.3" }),
      created_at: "2025-01-01",
    };
    const s = rowToScenario(legacy);
    expect(s.overrides.valueShock?.pct.toString()).toBe("0.3");
    expect(s.overrides.valueShock?.atYear).toBe(0);
  });
});

describe("scenarios repository", () => {
  let sql: TestSql;
  beforeAll(async () => {
    sql = openMemorySql();
    await migrate(sql);
  });
  afterAll(() => sql.db.close());

  it("inserts, lists, updates (preserving created_at), and deletes by id", async () => {
    await upsertScenario(sql, scenarioToRow(sample, created));
    let all = await listScenarios(sql);
    expect(all.map((s) => s.id)).toEqual(["s-1"]);

    // Rename + change overrides with a different created_at in the row → name/overrides
    // change but the stored created_at is preserved.
    await upsertScenario(
      sql,
      scenarioToRow(
        {
          ...sample,
          name: "Severe recession",
          overrides: {
            ...sample.overrides,
            valueShock: { pct: rate("0.35"), atYear: 10 },
          },
        },
        isoDate("2030-01-01"),
      ),
    );
    all = await listScenarios(sql);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Severe recession");
    expect(all[0].overrides.valueShock?.pct.toString()).toBe("0.35");
    expect(all[0].overrides.valueShock?.atYear).toBe(10);
    expect(
      sql.db.prepare("SELECT created_at FROM scenarios WHERE id = 's-1'").get(),
    ).toEqual({ created_at: "2026-06-08T00:00:00.000Z" });

    await deleteScenario(sql, "s-1");
    expect(await listScenarios(sql)).toHaveLength(0);
  });
});

// DR-181 (ADR 0080): scenarios keep their creation order. New rows store a full ISO
// timestamp; older date-only rows keep their id order and sort before same-day new ones.
describe("scenario creation order", () => {
  let sql: TestSql;
  beforeAll(async () => {
    sql = openMemorySql();
    await migrate(sql);
  });
  afterAll(() => sql.db.close());

  it("stores created_at as a full timestamp", () => {
    const at = new Date("2026-10-02T09:15:30.123Z");
    expect(scenarioToRow(sample, at).created_at).toBe(
      "2026-10-02T09:15:30.123Z",
    );
  });

  it("lists same-day scenarios in creation order, after legacy date-only rows", async () => {
    for (const [id, created] of [
      ["legacy-b", "2026-10-02"],
      ["legacy-a", "2026-10-02"],
    ]) {
      await sql.execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        [id, id, '{"version":1}', created],
      );
    }
    // Random ids sort against creation order: "zz" is made first, "aa" second.
    for (const [id, at] of [
      ["zz", "2026-10-02T09:00:00.000Z"],
      ["aa", "2026-10-02T09:00:01.000Z"],
    ] as const) {
      await upsertScenario(
        sql,
        scenarioToRow({ ...sample, id, name: id }, new Date(at)),
      );
    }
    const all = await listScenarios(sql);
    expect(all.map((x) => x.id)).toEqual(["legacy-a", "legacy-b", "zz", "aa"]);
  });
});

describe("scenarios persist across a restart (gate)", () => {
  // A file-backed DB closed and reopened proves the row survives, exercising the same
  // load path (`listScenarios`) the store's `refresh()` runs on app init.
  it("a saved scenario is still there after closing and reopening the same file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ret-scen-"));
    const file = join(dir, "portfolio.db");
    try {
      const first = openMemorySql(file);
      await migrate(first);
      await upsertScenario(first, scenarioToRow(sample, created));
      first.db.close();

      const second = openMemorySql(file);
      const all = await listScenarios(second);
      second.db.close();

      expect(all.map((s) => s.id)).toEqual(["s-1"]);
      expect(all[0].name).toBe("Recession");
      expect(all[0].overrides.inflationShock?.durationYears).toBe(3);
      expect(all[0].overrides.valueShock?.atYear).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
