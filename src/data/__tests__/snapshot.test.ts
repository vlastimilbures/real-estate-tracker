// #471: the count-checked snapshot read the backup export uses.
import { describe, expect, it } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { snapshot } from "../snapshot";
import type { Sql } from "../sql";

const statements = [{ query: "SELECT 1 AS a" }, { query: "SELECT 2 AS b" }];

describe("snapshot (#471)", () => {
  it("returns one row list per statement, in order", async () => {
    expect(await snapshot(openMemorySql(), statements)).toEqual([
      [{ a: 1 }],
      [{ b: 2 }],
    ]);
  });

  it("refuses a snapshot with a result set missing", async () => {
    const sql = openMemorySql();
    const short: Sql = {
      ...sql,
      selectSnapshot: async (s) => (await sql.selectSnapshot(s)).slice(0, 1),
    };
    await expect(snapshot(short, statements)).rejects.toThrow(
      "the snapshot returned 1 of 2 result sets",
    );
  });
});
