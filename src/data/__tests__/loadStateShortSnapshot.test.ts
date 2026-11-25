// #471: what `loadState` does today when the adapter's snapshot returns fewer result sets
// than it asked for. Unlike the backup export (which refuses any short snapshot), the load
// does not check the count: a missing scenarios, sample or backup set reads as empty, a
// missing assumptions set stops the load (ROW_INVALID) and a missing portfolio set fails
// with a TypeError. Neither real adapter returns a short snapshot; making the load refuse
// one is a behaviour change held back from the #471 refactor, so this pins today's output.
import { describe, expect, it } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadState } from "../loadState";
import { SAMPLE_META_QUERY, BACKUP_META_QUERY } from "../appMeta";
import type { Sql } from "../sql";

async function short(keep: number): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return {
    ...sql,
    selectSnapshot: async (statements) =>
      (await sql.selectSnapshot(statements)).slice(0, keep),
  };
}

describe("loadState on a short snapshot (today's behaviour, #471)", () => {
  it("asks for nine result sets", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    let asked: unknown[] = [];
    await loadState({
      ...sql,
      selectSnapshot: (statements) => {
        asked = statements;
        return sql.selectSnapshot(statements);
      },
    });
    expect(asked).toHaveLength(9);
    expect(asked.slice(7)).toEqual([SAMPLE_META_QUERY, BACKUP_META_QUERY]);
  });

  it("reads missing scenarios, sample and backup sets as empty", async () => {
    const state = await loadState(await short(6));
    expect(state.portfolio.properties).toHaveLength(3);
    expect(state.assumptions.horizonYears).toBe(30);
    expect(state.scenarios).toEqual([]);
    expect(state.sample).toEqual({ active: false, dismissed: false });
    expect(state.backup).toEqual({
      lastAt: null,
      lastFile: null,
      changedSince: false,
    });
  });

  it("stops on a missing assumptions set", async () => {
    await expect(loadState(await short(5))).rejects.toMatchObject({
      code: "ROW_INVALID",
    });
  });

  it("fails with a TypeError on a missing portfolio set", async () => {
    await expect(loadState(await short(4))).rejects.toBeInstanceOf(TypeError);
  });
});
