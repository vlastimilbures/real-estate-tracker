// The copyable examples in docs/csv-import.md (#29) must import cleanly into a fresh
// database, so the guide cannot drift from the importer. Synthetic data only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { upsertAssumptions } from "../../data/repositories";
import { SEED_ASSUMPTIONS } from "../../data/seed";
import {
  parseMortgages,
  parseProperties,
  parseRents,
  parseValuations,
} from "../csv";
import { importCsv } from "../csvImport";

const guide = readFileSync(
  join(__dirname, "..", "..", "..", "docs", "csv-import.md"),
  "utf8",
);

/** The guide's ```csv blocks, keyed by their header's first column pair. */
const blocks = [...guide.matchAll(/```csv\n([\s\S]*?)```/g)].map(
  (m) => m[1] ?? "",
);
const block = (header: string): string => {
  const found = blocks.filter((b) => b.startsWith(header));
  expect(found).toHaveLength(1);
  return found[0] ?? "";
};

let sql: TestSql | undefined;
afterEach(() => sql?.db.close());

describe("docs/csv-import.md examples", () => {
  it("has one example per file", () => {
    expect(blocks).toHaveLength(4);
  });

  it("every example parses without errors and imports into a fresh DB", async () => {
    const properties = parseProperties(block("name,"));
    const names = new Set(properties.rows.map((r) => r.name));
    const valuations = parseValuations(
      block("property_name,valid_from,"),
      names,
    );
    const rents = parseRents(
      block("property_name,start_date,end_date,"),
      names,
    );
    const mortgages = parseMortgages(
      block("property_name,start_date,initial_principal,"),
      names,
    );
    for (const r of [properties, valuations, rents, mortgages])
      expect(r.errors).toEqual([]);

    sql = openMemorySql();
    await migrate(sql);
    await upsertAssumptions(sql, SEED_ASSUMPTIONS);
    const report = await importCsv(sql, {
      properties: properties.rows,
      valuations: valuations.rows,
      rents: rents.rows,
      mortgages: mortgages.rows,
    });
    expect(report.upserted).toEqual({
      properties: 2,
      valuations: 3,
      leases: 3,
      mortgage_blocks: 2,
    });
  });
});
