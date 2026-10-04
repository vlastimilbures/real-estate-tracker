// D-29: migration v6 adds the optional contract maturity date to mortgage blocks.
// Forward-only, on a synthetic v5 database: existing rows are kept and get NULL
// ("needs owner input" — never guessed); the mapper round-trips the new field.
import { describe, it, expect } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { schemaAt } from "./schemaAt";
import { migrate, MIGRATIONS } from "../migrations";
import { loadPortfolio } from "../repositories";
import {
  mortgageBlockToRow,
  rowToMortgageBlock,
  type MortgageBlockRow,
} from "../mappers";
import { isoDate, rate, type MortgageBlock } from "../../engine";
import { money } from "../../engine";

const block: MortgageBlock = {
  id: "m1",
  propertyId: "p1",
  startDate: isoDate("2024-03-12"),
  initialPrincipal: money("3034500"),
  fixationYears: 7,
  interestRatePa: rate("0.0449"),
  monthlyInstalment: money("21576.4"),
};

describe("migration v6 — contract maturity date (D-29)", () => {
  it("upgrades a v5 database, keeping its loans with a NULL maturity", async () => {
    const sql = await schemaAt(5);
    await sql.execute(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p1', 'P', '2023-02-01', '6375000')",
    );
    await sql.execute(
      "INSERT INTO mortgage_blocks (id, property_id, start_date, initial_principal, fixation_years, interest_rate_pa, monthly_instalment) VALUES ('m1', 'p1', '2024-03-12', '3034500', 7, '0.0449', '21576.4')",
    );
    await migrate(sql);

    const rows = await sql.select<Record<string, unknown>>(
      "SELECT * FROM mortgage_blocks",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].contract_maturity_date).toBeNull();
    const versions = await sql.select<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(versions.map((v) => v.version)).toEqual(
      MIGRATIONS.map((m) => m.version),
    );
    const [m] = (await loadPortfolio(sql)).mortgages;
    expect(m.contractMaturityDate).toBeUndefined();
    sql.db.close();
  });

  it("stores and loads a contract maturity date", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await sql.execute(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p1', 'P', '2023-02-01', '6375000')",
    );
    const row = mortgageBlockToRow({
      ...block,
      contractMaturityDate: isoDate("2040-11-12"),
    });
    const cols = Object.keys(row);
    await sql.execute(
      `INSERT INTO mortgage_blocks (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      Object.values(row),
    );
    const [m] = (await loadPortfolio(sql)).mortgages;
    expect(m.contractMaturityDate?.toISOString().slice(0, 10)).toBe(
      "2040-11-12",
    );
    sql.db.close();
  });
});

describe("mapper — contract maturity date", () => {
  it("round-trips through row ⇄ block, NULL when absent", () => {
    const dated = { ...block, contractMaturityDate: isoDate("2040-11-12") };
    const row = mortgageBlockToRow(dated);
    expect(row.contract_maturity_date).toBe("2040-11-12");
    const back = rowToMortgageBlock({ ...row } as MortgageBlockRow);
    expect(back.contractMaturityDate?.getTime()).toBe(
      isoDate("2040-11-12").getTime(),
    );
    expect(mortgageBlockToRow(block).contract_maturity_date).toBeNull();
  });
});
