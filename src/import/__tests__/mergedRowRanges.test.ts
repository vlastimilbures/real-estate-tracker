// ADR 0257 §2: the import plan refuses a merged row that adds a value outside the bounded
// ranges, or changes a stored one to another, mapped to the CSV file, row and column. No
// in-range cell can produce one today, so the rows here are built past the parser. A
// stored out-of-range value that carries through still imports. Synthetic fixtures only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { upsertAssumptions } from "../../data/repositories";
import { SEED_ASSUMPTIONS } from "../../data/seed";
import { parseMortgages, parseProperties, parseValuations } from "../csv";
import { importCsv, previewImport } from "../csvImport";
import { importNow } from "./support/importNow";

const PH = "name,purchase_date,purchase_price,size_m2";
const PROPS = `${PH}\nByt A,2020-01-01,5000000,50\nByt B,2021-01-01,6000000,60`;
const MH =
  "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years";
const MORTGAGE = "Byt A,2021-01-17,2250000,10,0.0169,7908,25";
const VH = "property_name,valid_from,valid_to,market_value";

let sql: TestSql;

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await upsertAssumptions(sql, SEED_ASSUMPTIONS);
  await importNow(sql, {
    properties: parseProperties(PROPS).rows,
    mortgages: parseMortgages(`${MH}\n${MORTGAGE}`).rows,
  });
});

afterEach(() => sql.db.close());

/** One parsed row of `csv`, with `patch` applied past the parser. */
function mortgageRow(line: string, patch: Record<string, unknown> = {}) {
  return parseMortgages(`${MH}\n${line}`).rows.map((r) => ({
    ...r,
    ...patch,
  }));
}
function propertyRow(
  line: string,
  header = PH,
  patch: Record<string, unknown> = {},
) {
  return parseProperties(`${header}\n${line}`).rows.map((r) => ({
    ...r,
    ...patch,
  }));
}

/** Store `value` in `table.column` past the import, as a restored file can (ADR 0148). */
function storeRaw(table: string, column: string, value: number): void {
  sql.db.prepare(`UPDATE ${table} SET ${column} = ?`).run(value);
}

describe("a merged row that adds an out-of-range value is refused (ADR 0257)", () => {
  it("refuses a new block with a fixation of 60 years, on its row and column", async () => {
    const p = await previewImport(sql, {
      mortgages: mortgageRow("Byt B,2022-01-01,1000000,5,0.05,6000,20", {
        fixation_years: 60,
      }),
    });
    expect(p.problems).toEqual([
      {
        file: "mortgages",
        row: 2,
        field: "fixation_years",
        problem: { code: "outOfRange", value: "60", min: 0, max: 50 },
      },
    ]);
  });

  it("refuses an update that sets a loan term of 60 years", async () => {
    const p = await previewImport(sql, {
      mortgages: mortgageRow(MORTGAGE, { loan_term_years: 60 }),
    });
    expect(p.problems).toEqual([
      {
        file: "mortgages",
        row: 2,
        field: "loan_term_years",
        problem: { code: "outOfRange", value: "60", min: 1, max: 50 },
      },
    ]);
  });

  it("refuses a size of 20 000 m² with the size's range code", async () => {
    const p = await previewImport(sql, {
      properties: propertyRow("Byt C,2022-01-01,7000000,50", PH, {
        size_m2: 20000,
      }),
    });
    expect(p.problems).toEqual([
      {
        file: "properties",
        row: 2,
        field: "size_m2",
        problem: { code: "sizeRange", value: "20000", min: 1, max: 10000 },
      },
    ]);
  });

  it("writes nothing when refused", async () => {
    await expect(
      importCsv(sql, {
        properties: propertyRow("Byt C,2022-01-01,7000000,50", PH, {
          size_m2: 20000,
        }),
      }),
    ).rejects.toThrow();
    expect(
      sql.db.prepare("SELECT COUNT(*) AS n FROM properties").get(),
    ).toEqual({ n: 2 });
  });

  it("runs the engine rules first: a loan term of 0.5 is the engine's refusal only", async () => {
    const p = await previewImport(sql, {
      mortgages: mortgageRow(MORTGAGE, { loan_term_years: 0.5 }),
    });
    expect(p.problems).toEqual([
      expect.objectContaining({
        field: "loan_term_years",
        problem: { code: "inputRule", rule: "INVALID_TERM" },
      }),
    ]);
  });
});

describe("a stored out-of-range value that carries through still imports (ADR 0257)", () => {
  beforeEach(() => {
    storeRaw("properties", "size_m2", 20000);
    storeRaw("mortgage_blocks", "fixation_years", 60);
  });

  it("an update that leaves it out of the file imports", async () => {
    const batch = {
      properties: propertyRow(
        "Byt A,2020-01-01,5100000",
        "name,purchase_date,purchase_price",
      ),
    };
    expect((await previewImport(sql, batch)).problems).toEqual([]);
    await importCsv(sql, batch);
    expect(
      sql.db
        .prepare(
          "SELECT purchase_price, size_m2 FROM properties WHERE name = ?",
        )
        .get("Byt A"),
    ).toEqual({ purchase_price: "5100000", size_m2: 20000 });
  });

  it("a row of another file for the same property imports", async () => {
    const batch = {
      valuations: parseValuations(`${VH}\nByt A,2027-06-01,,12000000`).rows,
    };
    expect((await previewImport(sql, batch)).problems).toEqual([]);
  });

  it("another block of the same file imports", async () => {
    const p = await previewImport(sql, {
      mortgages: mortgageRow("Byt B,2022-01-01,1000000,5,0.05,6000,20"),
    });
    expect(p.problems).toEqual([]);
  });

  it("an update that changes it to another out-of-range value is refused", async () => {
    const p = await previewImport(sql, {
      properties: propertyRow("Byt A,2020-01-01,5000000,50", PH, {
        size_m2: 30000,
      }),
    });
    expect(p.problems).toEqual([
      {
        file: "properties",
        row: 2,
        field: "size_m2",
        problem: { code: "sizeRange", value: "30000", min: 1, max: 10000 },
      },
    ]);
  });

  it("an update that fixes it imports", async () => {
    const p = await previewImport(sql, {
      properties: propertyRow("Byt A,2020-01-01,5000000,55"),
    });
    expect(p.problems).toEqual([]);
  });
});
