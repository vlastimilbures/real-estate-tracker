// The CSV write path (src/import/csvImport.ts, P5b): everything is resolved and checked
// before anything is written, and the write is one transaction — a failure keeps
// nothing (DR-023, DR-063). Synthetic fixtures only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import {
  loadAssumptions,
  loadPortfolio,
  upsertAssumptions,
} from "../../data/repositories";
import { SEED_ASSUMPTIONS } from "../../data/seed";
import type { Sql } from "../../data/sql";
import { portfolioKpis } from "../../engine";
import {
  parseMortgages,
  parseProperties,
  parseRents,
  parseValuations,
} from "../csv";
import { CsvImportError, importCsv } from "../csvImport";

const PROPS = `name,purchase_date,purchase_price
Byt A,2020-01-01,5000000
Byt B,2021-01-01,6000000`;
const MH =
  "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years,contract_maturity_date";
const FH =
  "name,purchase_date,purchase_price,own_cash,transaction_costs,initial_works";

let sql: TestSql;

/** A property's id, found by its name: new ids are random (ADR 0127). */
const idOf = (name: string) =>
  (
    sql.db.prepare("SELECT id FROM properties WHERE name = ?").get(name) as {
      id: string;
    }
  ).id;

/** The stored funding record of one property. */
const funding = (name: string) =>
  sql.db
    .prepare(
      "SELECT own_cash, transaction_costs, initial_works, funding_note FROM properties WHERE name = ?",
    )
    .get(name);

/** Every portfolio table, for "nothing changed" comparisons. */
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

async function refused(p: Promise<unknown>): Promise<CsvImportError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(CsvImportError);
  return e as CsvImportError;
}

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await upsertAssumptions(sql, SEED_ASSUMPTIONS);
  await importCsv(sql, {
    properties: parseProperties(PROPS).rows,
    mortgages: parseMortgages(
      `${MH}\nByt A,2021-01-17,2250000,10,0.0169,7908,,`,
    ).rows,
  });
});

afterEach(() => sql.db.close());

describe("importCsv — all or nothing", () => {
  it("an unknown property in a child file writes nothing (DR-023)", async () => {
    const before = dump(sql);
    const e = await refused(
      importCsv(sql, {
        properties: parseProperties(
          "name,purchase_date,purchase_price\nNew,2020-01-01,1",
        ).rows,
        rents: parseRents(
          "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
        ).rows,
      }),
    );
    expect(e.problems).toEqual([
      {
        file: "rents",
        row: 2,
        field: "property_name",
        problem: { code: "unknownProperty", value: "Nope" },
      },
    ]);
    expect(dump(sql)).toEqual(before);
  });

  it("a failure inside the write rolls every statement back (DR-063)", async () => {
    const before = dump(sql);
    const failing: Sql = {
      ...sql,
      transaction: (statements, options) =>
        sql.transaction(
          [...statements, { query: "INSERT INTO no_such_table VALUES (1)" }],
          options,
        ),
    };
    await expect(
      importCsv(failing, {
        properties: parseProperties(
          "name,purchase_date,purchase_price\nNew,2020-01-01,1\nByt B,2021-01-01,7000000",
        ).rows,
        valuations: parseValuations(
          "property_name,valid_from,valid_to,market_value\nNew,2026-01-01,,2",
        ).rows,
      }),
    ).rejects.toThrow(/no_such_table/);
    expect(dump(sql)).toEqual(before);
  });

  it("an engine input rule rejects the file and names the line (D-17)", async () => {
    const before = dump(sql);
    const e = await refused(
      importCsv(sql, {
        mortgages: parseMortgages(
          `${MH}\nByt B,2021-01-01,2000000,5,0.05,100,,`,
        ).rows,
      }),
    );
    expect(e.problems).toEqual([
      {
        file: "mortgages",
        row: 2,
        field: "monthly_instalment",
        problem: { code: "inputRule", rule: "INSTALMENT_BELOW_INTEREST" },
      },
    ]);
    expect(dump(sql)).toEqual(before);
  });
});

describe("importCsv — matching and preserved fields", () => {
  it("matches a property name case-insensitively and keeps its spelling (D-55)", async () => {
    await importCsv(sql, {
      properties: parseProperties(
        "name,purchase_date,purchase_price\n byt a ,2020-01-01,5100000",
      ).rows,
      valuations: parseValuations(
        "property_name,valid_from,valid_to,market_value\nBYT A,2026-01-01,,9000000",
      ).rows,
    });
    const props = sql.db
      .prepare("SELECT name, purchase_price FROM properties ORDER BY name")
      .all();
    expect(props).toEqual([
      { name: "Byt A", purchase_price: "5100000" },
      { name: "Byt B", purchase_price: "6000000" },
    ]);
    expect(sql.db.prepare("SELECT property_id FROM valuations").all()).toEqual([
      { property_id: idOf("Byt A") },
    ]);
  });

  it("a re-import keeps the active flag, draws, interest-only date and a stored maturity (DR-129)", async () => {
    sql.db.exec(`
      UPDATE properties SET active = 0 WHERE name = 'Byt A';
      UPDATE mortgage_blocks SET contract_maturity_date = '2046-01-17',
        interest_only_until = '2021-06-30', loan_term_years = 25,
        draws = '[{"date":"2021-03-01","amount":"100000"}]';
    `);
    await importCsv(sql, {
      properties: parseProperties(PROPS).rows,
      mortgages: parseMortgages(
        `${MH}\nByt A,2021-01-17,2250000,10,0.0169,7908,25,`,
      ).rows,
    });
    expect(
      sql.db
        .prepare(
          "SELECT contract_maturity_date, interest_only_until, draws FROM mortgage_blocks",
        )
        .get(),
    ).toEqual({
      contract_maturity_date: "2046-01-17",
      interest_only_until: "2021-06-30",
      draws: '[{"date":"2021-03-01","amount":"100000"}]',
    });
    expect(
      sql.db
        .prepare("SELECT active FROM properties WHERE name = 'Byt A'")
        .get(),
    ).toEqual({ active: 0 });

    await importCsv(sql, {
      mortgages: parseMortgages(
        `${MH}\nByt A,2021-01-17,2250000,10,0.0169,7908,25,2046-02-17`,
      ).rows,
    });
    expect(
      sql.db
        .prepare("SELECT contract_maturity_date FROM mortgage_blocks")
        .get(),
    ).toEqual({ contract_maturity_date: "2046-02-17" });
  });

  it("a re-import keeps stored prepayments and recasts; a new loan has none (ADR 0109)", async () => {
    const prepayments =
      '[{"date":"2026-01-17","amount":"100000","effect":"shortenTerm"}]';
    const recasts = '[{"date":"2031-01-17","maturity":"2045-01-17"}]';
    sql.db
      .prepare("UPDATE mortgage_blocks SET prepayments = ?, recasts = ?")
      .run(prepayments, recasts);
    await importCsv(sql, {
      mortgages: parseMortgages(
        `${MH}\nByt A,2021-01-17,2250000,10,0.0169,7908,25,\nByt A,2031-01-17,1500000,5,0.045,9000,15,`,
      ).rows,
    });
    expect(
      sql.db
        .prepare(
          "SELECT start_date, prepayments, recasts FROM mortgage_blocks ORDER BY start_date",
        )
        .all(),
    ).toEqual([
      { start_date: "2021-01-17", prepayments, recasts },
      { start_date: "2031-01-17", prepayments: null, recasts: null },
    ]);
  });

  it("a re-import keeps a stored funding record; a new property has none (ADR 0119)", async () => {
    sql.db.exec(`
      UPDATE properties SET own_cash = '1500000', transaction_costs = '95000',
        initial_works = '0', funding_note = 'Deposit' WHERE name = 'Byt A';
    `);
    await importCsv(sql, {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nByt A,2020-01-01,5100000\nByt C,2024-01-01,3000000",
      ).rows,
    });
    expect(
      sql.db
        .prepare(
          "SELECT name, purchase_price, own_cash, transaction_costs, initial_works, funding_note FROM properties WHERE name IN ('Byt A', 'Byt C') ORDER BY name",
        )
        .all(),
    ).toEqual([
      {
        name: "Byt A",
        purchase_price: "5100000",
        own_cash: "1500000",
        transaction_costs: "95000",
        initial_works: "0",
        funding_note: "Deposit",
      },
      {
        name: "Byt C",
        purchase_price: "3000000",
        own_cash: null,
        transaction_costs: null,
        initial_works: null,
        funding_note: null,
      },
    ]);
  });

  it("a new property takes its funding amounts from the CSV; a blank cell is unknown (ADR 0119 §8)", async () => {
    await importCsv(sql, {
      properties: parseProperties(`${FH}\nByt C,2024-01-01,3000000,900000,,0`)
        .rows,
    });
    expect(funding("Byt C")).toEqual({
      own_cash: "900000",
      transaction_costs: null,
      initial_works: "0",
      funding_note: null,
    });
  });

  it("a re-import sets a filled funding amount and keeps a blank one (ADR 0119 §8)", async () => {
    sql.db.exec(`
      UPDATE properties SET own_cash = '1500000', transaction_costs = '95000',
        funding_note = 'Deposit' WHERE name = 'Byt A';
    `);
    await importCsv(sql, {
      properties: parseProperties(
        `${FH}\nByt A,2020-01-01,5000000,1600000,,25000`,
      ).rows,
    });
    // own cash changed, costs kept, works filled in from unknown, note kept
    expect(funding("Byt A")).toEqual({
      own_cash: "1600000",
      transaction_costs: "95000",
      initial_works: "25000",
      funding_note: "Deposit",
    });
  });

  it("imported own cash reaches the engine as a future buy's down payment (ADR 0119 §5)", async () => {
    const cumulative = async () =>
      portfolioKpis(await loadPortfolio(sql), await loadAssumptions(sql))
        .cumulativeNetCashFlow;
    // Bought after the seed baseDate (2026-06-07), no loan: the derived down payment is
    // the price, 5,000,000, as the entered costs and works are 0.
    await importCsv(sql, {
      properties: parseProperties(`${FH}\nByt F,2027-03-01,5000000,,0,0`).rows,
    });
    const derived = await cumulative();
    await importCsv(sql, {
      properties: parseProperties(`${FH}\nByt F,2027-03-01,5000000,1500000,,`)
        .rows,
    });
    const recorded = await cumulative();

    const f = (await loadPortfolio(sql)).properties.find(
      (p) => p.name === "Byt F",
    )?.funding;
    expect(f?.ownCash?.toString()).toBe("1500000");
    expect(f?.transactionCosts?.toString()).toBe("0");
    expect(f?.initialWorks?.toString()).toBe("0");
    // 5,000,000 derived − 1,500,000 own cash = 3,500,000 less paid out. The engine sums
    // at full precision, so compare to the haléř.
    expect(recorded.minus(derived).toFixed(2)).toBe("3500000.00");
  });

  it("gives every new property a holding-costs row", async () => {
    await importCsv(sql, {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nByt C,2020-01-01,1",
      ).rows,
    });
    expect(
      sql.db
        .prepare(
          "SELECT p.name FROM holding_costs h JOIN properties p ON p.id = h.property_id ORDER BY p.name",
        )
        .all(),
    ).toEqual([{ name: "Byt A" }, { name: "Byt B" }, { name: "Byt C" }]);
  });
});

// DR-137: a stored row whose date was edited after an earlier import still holds the id
// generated from its old date. A new CSV row with that old date must get a fresh id
// instead of failing the whole import on the PRIMARY KEY.
describe("importCsv — generated ids never collide (DR-137)", () => {
  it("re-importing a date whose generated id is taken gets a fresh id", async () => {
    const VH = "property_name,valid_from,valid_to,market_value";
    await importCsv(sql, {
      valuations: parseValuations(
        `${VH}\nByt A,2026-06-01,,12000000`,
        new Set(["Byt A"]),
      ).rows,
    });
    sql.db
      .prepare(
        "UPDATE valuations SET valid_from = '2026-07-01' WHERE valid_from = '2026-06-01'",
      )
      .run();
    const report = await importCsv(sql, {
      valuations: parseValuations(
        `${VH}\nByt A,2026-06-01,,12500000`,
        new Set(["Byt A"]),
      ).rows,
    });
    expect(report.upserted.valuations).toBe(1);
    const rows = sql.db
      .prepare("SELECT id, valid_from FROM valuations ORDER BY valid_from")
      .all() as { id: string; valid_from: string }[];
    expect(rows.map((r) => r.valid_from)).toEqual(["2026-06-01", "2026-07-01"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });
});

describe('a property stored with the id "" (ADR 0127)', () => {
  it("takes its loan, valuation and rent rows", async () => {
    sql.db
      .prepare(
        "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('', 'Квартира', '2020-01-01', '3000000')",
      )
      .run();
    await importCsv(sql, {
      mortgages: parseMortgages(
        `${MH}\nКвартира,2021-01-17,1000000,10,0.0169,3515,,`,
      ).rows,
      valuations: parseValuations(
        "property_name,valid_from,valid_to,market_value\nКвартира,2026-06-01,,3500000",
      ).rows,
      rents: parseRents(
        "property_name,start_date,end_date,monthly_rent\nКвартира,2025-01-01,,15000",
      ).rows,
    });
    for (const t of ["mortgage_blocks", "valuations", "leases"])
      expect(
        sql.db.prepare(`SELECT id FROM ${t} WHERE property_id = ''`).all(),
      ).toHaveLength(1);
  });
});

describe("new property ids (ADR 0127)", () => {
  it("a Cyrillic name imports together with its rents", async () => {
    await importCsv(sql, {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nКвартира,2020-01-01,3000000",
      ).rows,
      rents: parseRents(
        "property_name,start_date,end_date,monthly_rent\nКвартира,2025-01-01,,15000",
      ).rows,
    });
    const id = idOf("Квартира");
    expect(id).not.toBe("");
    expect(sql.db.prepare("SELECT property_id FROM leases").all()).toEqual([
      { property_id: id },
    ]);
  });

  it("a name like a sample flat's does not get the sample's id", async () => {
    await importCsv(sql, {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nJavorová,2020-01-01,3000000",
      ).rows,
    });
    expect(idOf("Javorová")).not.toBe("javorova");
  });
});
