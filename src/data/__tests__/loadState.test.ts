// DR-134 (P9): the store's load reads every table in one point-in-time snapshot.
// `loadState` reads everything through one `selectSnapshot` call.
import { describe, it, expect } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadState, upsertAssumptions, upsertScenario } from "../repositories";
import { scenarioToRow } from "../mappers";
import { isoDate, rate } from "../../engine";
import type { Sql } from "../sql";
import { SEED_ASSUMPTIONS } from "../seed";

async function seeded() {
  const db = openMemorySql();
  await migrate(db);
  await seedIfEmpty(db);
  await upsertScenario(
    db,
    scenarioToRow(
      {
        id: "s-1",
        name: "Shock",
        overrides: { appreciationPa: rate("0.01") },
      },
      isoDate("2026-06-08"),
    ),
  );
  return db;
}

describe("loadState", () => {
  it("returns the portfolio, assumptions, scenarios and the sample and backup state", async () => {
    const db = await seeded();
    const state = await loadState(db);
    expect(state.portfolio.properties.map((p) => p.id).sort()).toEqual([
      "dubova",
      "javorova",
      "lipova",
    ]);
    expect(state.assumptions.baseDate).toEqual(SEED_ASSUMPTIONS.baseDate);
    expect(state.assumptions.horizonYears).toBe(SEED_ASSUMPTIONS.horizonYears);
    expect(state.scenarios.map((s) => s.id)).toEqual(["s-1"]);
    expect(state).toMatchObject({
      unreadableScenarios: [],
      sample: { active: true, dismissed: false },
      backup: { lastAt: null, lastFile: null, changedSince: false },
    });
  });

  it("reads through one snapshot call and no separate selects", async () => {
    const db = await seeded();
    let snapshots = 0;
    let selects = 0;
    const counting: Sql = {
      ...db,
      select: (q, p) => {
        selects++;
        return db.select(q, p);
      },
      selectSnapshot: (s) => {
        snapshots++;
        return db.selectSnapshot(s);
      },
    };
    await loadState(counting);
    expect({ snapshots, selects }).toEqual({ snapshots: 1, selects: 0 });
  });

  // ADR 0123 §6 (#107, G1-3-09): created_at only orders the list in SQL; the app does
  // not read it, so a bad stored value can no longer stop the app from loading.
  it("loads a scenario whose stored created_at is not a date", async () => {
    const db = await seeded();
    await db.execute("UPDATE scenarios SET created_at = '2026-13-45'");
    const state = await loadState(db);
    expect(state.scenarios.map((s) => s.id)).toEqual(["s-1"]);
  });

  // ADR 0123 §7 (#107): a scenario is a what-if, so one the app cannot read is left out
  // and listed instead of failing the whole load.
  it("leaves out a scenario row it cannot read and lists it", async () => {
    const db = await seeded();
    await db.execute(
      "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
      [
        "bad",
        "Broken",
        '{"version":1,"valueShock":{"pct":"x"}}',
        "2026-01-01T00:00:00.000Z",
      ],
    );
    const state = await loadState(db);
    expect(state.scenarios.map((s) => s.id)).toEqual(["s-1"]);
    expect(state.unreadableScenarios).toEqual([{ id: "bad", name: "Broken" }]);
  });

  it("still fails without the assumptions row", async () => {
    const db = await seeded();
    await db.execute("DELETE FROM assumptions");
    await expect(loadState(db)).rejects.toThrow(
      "assumptions row not found (id = 1)",
    );
  });
});

describe("selectSnapshot (test adapter)", () => {
  it("returns one row list per statement and rejects on a bad query", async () => {
    const db = await seeded();
    const [one, two] = await db.selectSnapshot([
      { query: "SELECT 1 AS n" },
      { query: "SELECT ? AS v", params: ["x"] },
    ]);
    expect(one).toEqual([{ n: 1 }]);
    expect(two).toEqual([{ v: "x" }]);
    await expect(
      db.selectSnapshot([{ query: "SELECT * FROM missing" }]),
    ).rejects.toThrow(/no such table/);
  });
});

describe("property order (ADR 0127)", () => {
  it("lists properties by name in Czech order, numbers by value, not by id", async () => {
    const db = openMemorySql();
    await migrate(db);
    await upsertAssumptions(db, SEED_ASSUMPTIONS);
    const insert = db.db.prepare(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES (?, ?, '2020-01-01', '1000000')",
    );
    for (const [id, name] of [
      ["a", "Byt Chalupa"],
      ["b", "Byt Čapkova"],
      ["c", "Byt 10"],
      ["d", "Byt Hradní"],
      ["e", "Byt Cibulka"],
      ["f", "Byt 2"],
      ["g", "Byt Dubova"],
    ])
      insert.run(id, name);
    const names = (await loadState(db)).portfolio.properties.map((p) => p.name);
    expect(names).toEqual([
      "Byt 2",
      "Byt 10",
      "Byt Cibulka",
      "Byt Čapkova",
      "Byt Dubova",
      "Byt Hradní",
      "Byt Chalupa",
    ]);
  });
});
