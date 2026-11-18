// ADR 0252 §1: the first run writes the assumptions row only where none exists. A database
// that already holds a row (no properties, no seed flag) keeps it as it is.
import { describe, it, expect, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { SEED_ASSUMPTIONS, seedIfEmpty } from "../seed";
import { upsertAssumptions } from "../repositories";
import { isoDate, rate } from "../../engine";

let sql: TestSql;
afterEach(() => sql.db.close());

describe("the first-run seed and an existing assumptions row (ADR 0252)", () => {
  it("leaves a custom row unchanged", async () => {
    sql = openMemorySql();
    await migrate(sql);
    await upsertAssumptions(sql, {
      ...SEED_ASSUMPTIONS,
      baseDate: isoDate("2027-03-01"),
      appreciationPa: rate("0.021"),
      horizonYears: 12,
    });
    await sql.execute("DELETE FROM app_meta");
    const before = await sql.select("SELECT * FROM assumptions");

    expect(await seedIfEmpty(sql)).toBe(true);
    expect(await sql.select("SELECT * FROM assumptions")).toEqual(before);
  });
});
