// D-29: the optional contract maturity date of mortgage blocks (added in v6, part of the
// version 8 baseline since ADR 0230); the mapper round-trips the field.
import { describe, it, expect } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { migrate } from "../migrations";
import {
  mortgageBlockToRow,
  rowToMortgageBlock,
  type MortgageBlockRow,
} from "../mappers";
import { isoDate } from "../../engine";
import { loadPortfolio } from "./support/reads";
import { upsertAssumptions } from "../repositories";
import { SEED_ASSUMPTIONS } from "../seed";
import { storedLoan as block } from "../../engine/__tests__/support/loan";

describe("migration v6 — contract maturity date (D-29)", () => {
  it("stores and loads a contract maturity date", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await upsertAssumptions(sql, SEED_ASSUMPTIONS);
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
