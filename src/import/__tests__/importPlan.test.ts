// ADR 0096 (#34): the import plan classifies each row as add, update or unchanged; the
// preview and the commit share it, and a commit whose plan changed since the preview
// writes nothing. Synthetic fixtures only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import {
  CsvPlanChangedError,
  importCsv,
  planImport,
  previewImport,
} from "../csvImport";

const PROPS = `name,address,purchase_date,purchase_price
Byt A,Javorova 12,2020-01-01,5000000
Byt B,,2021-01-01,6000000`;
const PH = "name,address,purchase_date,purchase_price";
const MH =
  "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years,contract_maturity_date";
const MORTGAGE = "Byt A,2021-01-17,2250000,10,0.0169,7908,,2046-01-17";
const VH = "property_name,valid_from,valid_to,market_value";
const RH = "property_name,start_date,end_date,monthly_rent";

let sql: TestSql;

function dump(s: TestSql) {
  const out: Record<string, unknown[]> = {};
  for (const t of [
    "properties",
    "mortgage_blocks",
    "valuations",
    "leases",
    "holding_costs",
  ])
    out[t] = s.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
  return out;
}

const props = (body: string) => parseProperties(`${PH}\n${body}`).rows;

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await upsertAssumptions(sql, SEED_ASSUMPTIONS);
  await importCsv(sql, {
    properties: parseProperties(PROPS).rows,
    mortgages: parseMortgages(`${MH}\n${MORTGAGE}`).rows,
  });
});

afterEach(() => sql.db.close());

describe("previewImport — add, update, unchanged (ADR 0096)", () => {
  it("a new name is an add", async () => {
    const p = await previewImport(sql, {
      properties: props("Byt C,,2022-01-01,7000000"),
    });
    expect(p.problems).toEqual([]);
    expect(p.items).toEqual([
      expect.objectContaining({
        file: "properties",
        row: 2,
        kind: "add",
        propertyName: "Byt C",
        date: null,
        changes: [],
      }),
    ]);
  });

  it("a match with a changed column is an update listing before → after", async () => {
    const p = await previewImport(sql, {
      properties: props("byt a,Javorova 12,2020-01-01,5100000"),
    });
    expect(p.items).toEqual([
      expect.objectContaining({
        kind: "update",
        propertyId: "byt-a",
        // the stored spelling, not the CSV's
        propertyName: "Byt A",
        changes: [
          { field: "purchase_price", before: "5000000", after: "5100000" },
        ],
      }),
    ]);
  });

  it("a match whose values are equal is unchanged (decimals by value)", async () => {
    const p = await previewImport(sql, {
      properties: props("Byt A,Javorova 12,2020-01-01,5000000.00"),
    });
    expect(p.items).toEqual([
      expect.objectContaining({ kind: "unchanged", changes: [] }),
    ]);
  });

  it("an empty cell that clears a stored value is an update", async () => {
    const p = await previewImport(sql, {
      properties: props("Byt A,,2020-01-01,5000000"),
    });
    expect(p.items[0]).toEqual(
      expect.objectContaining({
        kind: "update",
        changes: [{ field: "address", before: "Javorova 12", after: null }],
      }),
    );
  });

  it("renaming a property in the CSV is an add, not an update", async () => {
    const p = await previewImport(sql, {
      properties: props("Byt A renamed,Javorova 12,2020-01-01,5000000"),
    });
    expect(p.items.map((i) => i.kind)).toEqual(["add"]);
  });

  it("an empty contract_maturity_date keeps the stored date and is no change", async () => {
    const p = await previewImport(sql, {
      mortgages: parseMortgages(
        `${MH}\nByt A,2021-01-17,2250000,10,0.0169,7908,,`,
      ).rows,
    });
    expect(p.items).toEqual([
      expect.objectContaining({
        file: "mortgages",
        kind: "unchanged",
        date: "2021-01-17",
      }),
    ]);
  });

  it("a blank funding cell keeps the stored amount and is no change (ADR 0119 §8)", async () => {
    sql.db.exec(
      "UPDATE properties SET own_cash = '1500000' WHERE id = 'byt-a'",
    );
    const preview = (ownCash: string) =>
      previewImport(sql, {
        properties: parseProperties(
          `${PH},own_cash\nByt A,Javorova 12,2020-01-01,5000000,${ownCash}`,
        ).rows,
      });
    for (const same of ["", "1500000.00"])
      expect((await preview(same)).items, same).toEqual([
        expect.objectContaining({ kind: "unchanged", changes: [] }),
      ]);
    expect((await preview("1600000")).items).toEqual([
      expect.objectContaining({
        kind: "update",
        changes: [{ field: "own_cash", before: "1500000", after: "1600000" }],
      }),
    ]);
  });

  it("classifies mixed files, children by property + date", async () => {
    const p = await previewImport(sql, {
      properties: props("Byt C,,2022-01-01,7000000"),
      valuations: parseValuations(`${VH}\nByt C,2026-01-01,,7500000`).rows,
      rents: parseRents(`${RH}\nByt B,2025-01-01,,21000`).rows,
      mortgages: parseMortgages(
        `${MH}\nByt A,2021-01-17,2250000,10,0.0199,7908,,`,
      ).rows,
    });
    expect(p.problems).toEqual([]);
    expect(
      p.items.map((i) => [i.file, i.kind, i.propertyName, i.date]),
    ).toEqual([
      ["properties", "add", "Byt C", null],
      ["mortgages", "update", "Byt A", "2021-01-17"],
      ["valuations", "add", "Byt C", "2026-01-01"],
      ["rents", "add", "Byt B", "2025-01-01"],
    ]);
    expect(p.items[1]?.changes).toEqual([
      { field: "interest_rate_pa", before: "0.0169", after: "0.0199" },
    ]);
  });

  it("reports problems without throwing or writing", async () => {
    const before = dump(sql);
    const p = await previewImport(sql, {
      rents: parseRents(`${RH}\nNope,2025-01-01,,1000`).rows,
    });
    expect(p.problems).toEqual([
      expect.objectContaining({
        file: "rents",
        row: 2,
        field: "property_name",
      }),
    ]);
    expect(dump(sql)).toEqual(before);
  });

  it("writes nothing", async () => {
    const before = dump(sql);
    await previewImport(sql, { properties: props("Byt C,,2022-01-01,1") });
    expect(dump(sql)).toEqual(before);
  });
});

describe("planImport is pure", () => {
  it("does not modify the tables it is given", () => {
    const tables = {
      properties: [],
      mortgage_blocks: [],
      valuations: [],
      leases: [],
      holding_costs: [],
    };
    const plan = planImport(
      { properties: props("Byt C,,2022-01-01,7000000") },
      tables,
    );
    expect(plan.items.map((i) => i.kind)).toEqual(["add"]);
    expect(tables.properties).toEqual([]);
    expect(tables.holding_costs).toEqual([]);
  });
});

describe("importCsv — commit matches the preview (ADR 0096)", () => {
  it("the report names the same records as the preview", async () => {
    const batch = {
      properties: props("Byt C,,2022-01-01,7000000\nByt A,,2020-01-01,5000000"),
      valuations: parseValuations(`${VH}\nByt C,2026-01-01,,7500000`).rows,
    };
    const preview = await previewImport(sql, batch);
    const report = await importCsv(sql, batch, preview.fingerprint);
    expect(report.items).toEqual(preview.items);
    expect(report.upserted.properties).toBe(2);
  });

  it("a plan that changed since the preview writes nothing", async () => {
    const batch = { properties: props("Byt A,Javorova 12,2020-01-01,5000000") };
    const preview = await previewImport(sql, batch);
    expect(preview.items[0]?.kind).toBe("unchanged");
    // Another edit lands between preview and commit.
    sql.db
      .prepare("UPDATE properties SET purchase_price = ? WHERE id = ?")
      .run("4900000", "byt-a");
    const before = dump(sql);

    const e = await importCsv(sql, batch, preview.fingerprint).then(
      () => null,
      (err: unknown) => err,
    );

    expect(e).toBeInstanceOf(CsvPlanChangedError);
    expect((e as CsvPlanChangedError).preview.items[0]).toEqual(
      expect.objectContaining({
        kind: "update",
        changes: [
          { field: "purchase_price", before: "4900000", after: "5000000" },
        ],
      }),
    );
    expect(dump(sql)).toEqual(before);
  });

  it("without an expected plan it imports as before", async () => {
    const report = await importCsv(sql, {
      properties: props("Byt C,,2022-01-01,7000000"),
    });
    expect(report.items.map((i) => i.kind)).toEqual(["add"]);
  });
});
