// DR-133: a write rejected by a v7 constraint must be recognised so the UI can show a
// translated message instead of SQLite's raw text. Real constraint failures come from
// a migrated in-memory DB; the Tauri wording (sqlx prefix, string rejection) is a
// literal sample.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { constraintOf } from "../errors";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";

let sql: TestSql;
beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
});
afterEach(() => sql.db.close());

async function failure(query: string, params: unknown[] = []) {
  try {
    await sql.execute(query, params);
  } catch (e) {
    return e;
  }
  throw new Error("expected the write to fail");
}

describe("constraintOf", () => {
  it("names table and columns of a UNIQUE failure", async () => {
    const [p] = await sql.select<{ name: string }>(
      "SELECT name FROM properties LIMIT 1",
    );
    const e = await failure(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('x', ?, '2020-01-01', '1')",
      [p.name],
    );
    expect(constraintOf(e)).toEqual({
      kind: "unique",
      table: "properties",
      columns: ["name"],
    });
  });

  it("names a composite UNIQUE key and a primary-key clash", async () => {
    const [v] = await sql.select<{
      id: string;
      property_id: string;
      valid_from: string;
    }>("SELECT id, property_id, valid_from FROM valuations LIMIT 1");
    const dup = await failure(
      "INSERT INTO valuations (id, property_id, valid_from, market_value) VALUES ('new', ?, ?, '1')",
      [v.property_id, v.valid_from],
    );
    expect(constraintOf(dup)).toEqual({
      kind: "unique",
      table: "valuations",
      columns: ["property_id", "valid_from"],
    });
    const pk = await failure(
      "INSERT INTO valuations (id, property_id, valid_from, market_value) VALUES (?, ?, '2099-01-01', '1')",
      [v.id, v.property_id],
    );
    expect(constraintOf(pk)).toEqual({
      kind: "unique",
      table: "valuations",
      columns: ["id"],
    });
  });

  it("names the CHECK constraint", async () => {
    const [l] = await sql.select<{ id: string }>(
      "SELECT id FROM leases LIMIT 1",
    );
    const e = await failure(
      "UPDATE leases SET monthly_rent = '-5' WHERE id = ?",
      [l.id],
    );
    expect(constraintOf(e)).toEqual({
      kind: "check",
      check: "lease_rent_not_negative",
    });
  });

  it("recognises FOREIGN KEY and NOT NULL failures", async () => {
    const fk = await failure(
      "INSERT INTO leases (id, property_id, start_date, monthly_rent) VALUES ('l', 'nope', '2026-01-01', '1')",
    );
    expect(constraintOf(fk)).toEqual({ kind: "foreignKey" });
    const nn = await failure(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('y', NULL, '2020-01-01', '1')",
    );
    expect(constraintOf(nn)).toEqual({
      kind: "notNull",
      table: "properties",
      columns: ["name"],
    });
  });

  it("reads the Tauri wording (sqlx prefix, string rejection)", () => {
    expect(
      constraintOf(
        "error returned from database: (code: 2067) UNIQUE constraint failed: leases.property_id, leases.start_date",
      ),
    ).toEqual({
      kind: "unique",
      table: "leases",
      columns: ["property_id", "start_date"],
    });
    expect(
      constraintOf(
        new Error(
          "error returned from database: (code: 275) CHECK constraint failed: mortgage_rate_0_to_1",
        ),
      ),
    ).toEqual({ kind: "check", check: "mortgage_rate_0_to_1" });
  });

  it("is null for anything else", () => {
    expect(constraintOf(new Error("disk is full"))).toBeNull();
    expect(constraintOf(undefined)).toBeNull();
  });
});
