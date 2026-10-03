// ADR 0109: migration v9 adds the nullable JSON columns mortgage_blocks.prepayments and
// .recasts. Forward-only, on a synthetic v8 database: existing loans keep NULL (no
// events, same numbers); the mapper round-trips both lists; bad JSON is refused.
import { describe, it, expect } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate, MIGRATIONS } from "../migrations";
import { loadPortfolio } from "../repositories";
import {
  mortgageBlockToRow,
  rowToMortgageBlock,
  type MortgageBlockRow,
} from "../mappers";
import { DataError } from "../errors";
import { isoDate, money, rate, type MortgageBlock } from "../../engine";

/** A database at schema `version`, built from the historical migrations. */
async function schemaAt(version: number): Promise<TestSql> {
  const sql = openMemorySql();
  await sql.execute(
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  for (const m of MIGRATIONS.filter((m) => m.version <= version)) {
    for (const stmt of m.sql.split(";")) {
      if (stmt.trim()) await sql.execute(stmt.trim());
    }
    await sql.execute(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      [m.version, m.name, "1970-01-01T00:00:00.000Z"],
    );
  }
  return sql;
}

const block: MortgageBlock = {
  id: "m1",
  propertyId: "p1",
  startDate: isoDate("2024-03-12"),
  initialPrincipal: money("3034500"),
  fixationYears: 7,
  interestRatePa: rate("0.0449"),
  monthlyInstalment: money("21576.4"),
};

const withEvents: MortgageBlock = {
  ...block,
  prepayments: [
    {
      date: isoDate("2031-03-12"),
      amount: money("500000"),
      effect: "shortenTerm",
      fee: money("2500.5"),
    },
    {
      date: isoDate("2027-01-20"),
      amount: money("100000"),
      effect: "lowerInstalment",
    },
  ],
  recasts: [
    { date: isoDate("2033-03-12"), maturity: isoDate("2050-03-12") },
    { date: isoDate("2031-03-12"), instalment: money("18000") },
  ],
};

async function insertRow(sql: TestSql, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  await sql.execute(
    `INSERT INTO mortgage_blocks (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    Object.values(row),
  );
}

async function withProperty(): Promise<TestSql> {
  const sql = openMemorySql();
  await migrate(sql);
  await sql.execute(
    "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p1', 'P', '2023-02-01', '6375000')",
  );
  return sql;
}

const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

describe("migration v9 — prepayments and recasts (ADR 0109)", () => {
  it("upgrades a v8 database, keeping its loans with no events", async () => {
    const sql = await schemaAt(8);
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
    expect(rows[0].prepayments).toBeNull();
    expect(rows[0].recasts).toBeNull();
    const [m] = (await loadPortfolio(sql)).mortgages;
    expect(m.prepayments).toBeUndefined();
    expect(m.recasts).toBeUndefined();
    sql.db.close();
  });

  it("stores and loads prepayments and recasts, sorted by date", async () => {
    const sql = await withProperty();
    await insertRow(sql, { ...mortgageBlockToRow(withEvents) });
    const [m] = (await loadPortfolio(sql)).mortgages;
    expect(
      m.prepayments?.map((p) => [iso(p.date), p.amount.toString(), p.effect]),
    ).toEqual([
      ["2027-01-20", "100000", "lowerInstalment"],
      ["2031-03-12", "500000", "shortenTerm"],
    ]);
    expect(m.prepayments?.[1].fee?.toString()).toBe("2500.5");
    expect(m.prepayments?.[0].fee).toBeUndefined();
    expect(m.recasts?.map((r) => iso(r.date))).toEqual([
      "2031-03-12",
      "2033-03-12",
    ]);
    expect(m.recasts?.[0].instalment?.toString()).toBe("18000");
    expect(iso(m.recasts?.[1].maturity)).toBe("2050-03-12");
    sql.db.close();
  });

  it.each(["prepayments", "recasts"])(
    "refuses %s that are not valid JSON",
    async (column) => {
      const sql = await withProperty();
      await expect(
        insertRow(sql, { ...mortgageBlockToRow(block), [column]: "[{" }),
      ).rejects.toThrow(`mortgage_${column}_json`);
      sql.db.close();
    },
  );
});

describe("mapper — prepayments and recasts", () => {
  const row = mortgageBlockToRow(block);
  const load = (patch: Partial<MortgageBlockRow>) =>
    rowToMortgageBlock({ ...row, ...patch });
  const reason = (patch: Partial<MortgageBlockRow>) => {
    try {
      load(patch);
    } catch (e) {
      expect(e).toBeInstanceOf(DataError);
      return (e as DataError).details.join(" ");
    }
    throw new Error("expected a DataError");
  };

  it("writes NULL without events, and a fee only when entered", () => {
    expect(row.prepayments).toBeNull();
    expect(row.recasts).toBeNull();
    expect(
      mortgageBlockToRow({ ...block, prepayments: [], recasts: [] }),
    ).toMatchObject({ prepayments: null, recasts: null });
    const json = JSON.parse(mortgageBlockToRow(withEvents).prepayments ?? "[]");
    expect(json[1]).toEqual({
      date: "2027-01-20",
      amount: "100000",
      effect: "lowerInstalment",
    });
  });

  it("round-trips through row ⇄ block", () => {
    const back = rowToMortgageBlock(mortgageBlockToRow(withEvents));
    expect(mortgageBlockToRow(back)).toEqual(
      mortgageBlockToRow({
        ...withEvents,
        prepayments: [...(withEvents.prepayments ?? [])].reverse(),
        recasts: [...(withEvents.recasts ?? [])].reverse(),
      }),
    );
  });

  it.each([
    [{ prepayments: "{}" }, "prepayments is not an array"],
    [{ prepayments: "nope" }, "prepayments is not valid JSON"],
    [
      {
        prepayments:
          '[{"date":"2027-13-01","amount":"1","effect":"lowerInstalment"}]',
      },
      "prepayments has an invalid date",
    ],
    [
      {
        prepayments:
          '[{"date":"2027-01-01","amount":"x","effect":"lowerInstalment"}]',
      },
      "prepayments has an invalid amount",
    ],
    [
      { prepayments: '[{"date":"2027-01-01","amount":"1","effect":"both"}]' },
      "prepayments has an invalid effect",
    ],
    [
      {
        prepayments:
          '[{"date":"2027-01-01","amount":"1","effect":"shortenTerm","fee":"x"}]',
      },
      "prepayments has an invalid amount",
    ],
    [
      {
        recasts:
          '[{"date":"2027-01-01","maturity":"2040-01-01","instalment":"9000"}]',
      },
      "recasts needs either a maturity or an instalment",
    ],
    [
      { recasts: '[{"date":"2027-01-01"}]' },
      "recasts needs either a maturity or an instalment",
    ],
    [
      { recasts: '[{"date":"2027-01-01","maturity":"soon"}]' },
      "recasts has an invalid maturity",
    ],
  ] as [Partial<MortgageBlockRow>, string][])(
    "rejects a corrupt row (%j)",
    (patch, message) => {
      expect(reason(patch)).toContain(`mortgage_blocks m1: ${message}`);
    },
  );
});
