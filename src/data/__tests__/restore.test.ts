// Versioned backups and the all-or-nothing restore (P5b): the whole file is checked
// before anything is touched, older backups are upgraded in memory, newer ones are
// refused, and the replacement is one transaction (DR-019, DR-038, D-54).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { MIGRATIONS, migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadState } from "../repositories";
import {
  BACKUP_MAX_BYTES,
  exportToJson,
  parseBackupText,
  prepareRestore,
  restoreFromJson,
  RestoreError,
  validateBackup,
  type BackupFile,
} from "../backup";
import { checkInputRules } from "../../import/inputRules";
import type { Sql } from "../sql";

const HEAD = Math.max(...MIGRATIONS.map((m) => m.version));

let sql: TestSql;

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
});

afterEach(() => sql.db.close());

function dump(s: TestSql) {
  const out: Record<string, unknown[]> = {};
  for (const t of [
    "properties",
    "mortgage_blocks",
    "valuations",
    "leases",
    "holding_costs",
    "assumptions",
    "scenarios",
  ])
    out[t] = s.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
  return out;
}

type Rows = Record<string, unknown>[];

/** The seeded backup with one table's rows edited. */
async function edited(
  table: string,
  edit: (rows: Rows) => Rows,
): Promise<BackupFile> {
  const b = await exportToJson(sql, new Date());
  const rows = (b.tables[table] as Rows).map((r) => ({ ...r }));
  return { ...b, tables: { ...b.tables, [table]: edit(rows) } };
}

async function rejection(p: Promise<unknown>): Promise<RestoreError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(RestoreError);
  return e as RestoreError;
}

describe("backup version (DR-038)", () => {
  it("a backup carries the database schema version", async () => {
    expect((await exportToJson(sql, new Date())).schemaVersion).toBe(HEAD);
  });

  it("refuses a backup from a newer app version before touching anything", async () => {
    const b = {
      ...(await exportToJson(sql, new Date())),
      schemaVersion: HEAD + 1,
    };
    const e = await rejection(Promise.resolve().then(() => validateBackup(b)));
    expect(e.code).toBe("BACKUP_NEWER");
  });

  it("accepts every older version, including the legacy constant 1", async () => {
    const b = await exportToJson(sql, new Date());
    for (let v = 1; v <= HEAD; v++)
      expect(validateBackup({ ...b, schemaVersion: v }).schemaVersion).toBe(v);
  });
});

describe("parseBackupText", () => {
  it("refuses a file over 20 MB before parsing it (D-53)", () => {
    expect(() => parseBackupText(" ".repeat(BACKUP_MAX_BYTES + 1))).toThrow(
      expect.objectContaining({ code: "BACKUP_TOO_LARGE" }),
    );
  });

  it("refuses text that is not JSON", () => {
    expect(() => parseBackupText("{not json")).toThrow(
      expect.objectContaining({ code: "BACKUP_NOT_JSON" }),
    );
  });
});

describe("restore checks every row before touching the DB (DR-019)", () => {
  it("an unreadable value", async () => {
    const before = dump(sql);
    const bad = await edited("valuations", (rows) => {
      rows[0].market_value = "abc";
      return rows;
    });
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.code).toBe("BACKUP_ROWS_INVALID");
    expect(e.issues).toEqual([
      expect.objectContaining({
        table: "valuations",
        id: bad.tables.valuations[0].id,
        rule: "UNREADABLE_VALUE",
      }),
    ]);
    expect(dump(sql)).toEqual(before);
  });

  it("an engine input rule (D-17) and a holding-cost share above 1 (D-54)", async () => {
    const before = dump(sql);
    const b = await exportToJson(sql, new Date());
    const mortgages = (b.tables.mortgage_blocks as Rows).map((r) => ({ ...r }));
    mortgages[0].monthly_instalment = "1";
    const costs = (b.tables.holding_costs as Rows).map((r) => ({ ...r }));
    costs[0].mgmt_pct_rent = "1.5";
    const bad = {
      ...b,
      tables: { ...b.tables, mortgage_blocks: mortgages, holding_costs: costs },
    };
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.issues).toEqual([
      {
        table: "mortgage_blocks",
        id: mortgages[0].id,
        column: "monthly_instalment",
        rule: "INSTALMENT_BELOW_INTEREST",
      },
      {
        table: "holding_costs",
        id: costs[0].id,
        column: "mgmt_pct_rent",
        rule: "RATE_OUT_OF_RANGE",
      },
    ]);
    expect(dump(sql)).toEqual(before);
  });

  it("a negative funding amount, on its column (ADR 0119)", async () => {
    const before = dump(sql);
    const bad = await edited("properties", (rows) => {
      rows[0].own_cash = "-1";
      rows[1].transaction_costs = "-0.5";
      return rows;
    });
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.issues).toEqual([
      {
        table: "properties",
        id: bad.tables.properties[0].id,
        column: "own_cash",
        rule: "NEGATIVE_AMOUNT",
      },
      {
        table: "properties",
        id: bad.tables.properties[1].id,
        column: "transaction_costs",
        rule: "NEGATIVE_AMOUNT",
      },
    ]);
    expect(dump(sql)).toEqual(before);
  });

  it("a duplicate natural key", async () => {
    const before = dump(sql);
    const bad = await edited("valuations", (rows) => [
      ...rows,
      { ...rows[0], id: "dup" },
    ]);
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.issues).toEqual([
      {
        table: "valuations",
        id: "dup",
        column: "property_id, valid_from",
        rule: "DUPLICATE_KEY",
      },
    ]);
    expect(dump(sql)).toEqual(before);
  });

  // ADR 0086 (#38): the form and CSV whole-number bounds apply to restore too; since
  // ADR 0148 (#133) a value outside them is a warning the confirm step asks about.
  it.each([
    ["assumptions", "horizon_years", 101, 100, { min: 1, max: 100 }],
    ["mortgage_blocks", "fixation_years", 51, 50, { min: 0, max: 50 }],
    ["mortgage_blocks", "loan_term_years", 51, 50, { min: 1, max: 50 }],
    ["properties", "size_m2", 10_001, 10_000, { min: 1, max: 10_000 }],
  ])("%s.%s outside its range", async (table, column, out, edge, range) => {
    const set = (n: number) =>
      edited(table, (rows) => {
        rows[0][column] = n;
        return rows;
      });
    const bad = await set(out);
    expect(prepareRestore(bad, checkInputRules).warnings).toEqual([
      {
        table,
        ...(table !== "assumptions" && { id: bad.tables[table][0].id }),
        column,
        rule: "OUT_OF_RANGE",
        range,
      },
    ]);
    expect(prepareRestore(await set(edge), checkInputRules).warnings).toEqual(
      [],
    );

    await restoreFromJson(sql, await set(edge), checkInputRules);
    const id = bad.tables[table][0].id;
    expect(
      sql.db
        .prepare(`SELECT ${column} AS v FROM ${table} WHERE id = ?`)
        .get(id),
    ).toEqual({ v: edge });
  });

  it("a missing assumptions row", async () => {
    const e = await rejection(
      restoreFromJson(
        sql,
        await edited("assumptions", () => []),
        checkInputRules,
      ),
    );
    expect(e.issues).toEqual([
      { table: "assumptions", rule: "MISSING_ASSUMPTIONS" },
    ]);
  });

  it("a prepayment dated before its loan starts (#118, ADR 0109)", async () => {
    const before = dump(sql);
    const bad = await edited("mortgage_blocks", (rows) => {
      rows[0].prepayments = JSON.stringify([
        { date: "2020-01-01", amount: "100000", effect: "shortenTerm" },
      ]);
      return rows;
    });
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.code).toBe("BACKUP_ROWS_INVALID");
    expect(e.issues).toEqual([
      {
        table: "mortgage_blocks",
        id: bad.tables.mortgage_blocks[0].id,
        column: "prepayments",
        rule: "EVENT_BEFORE_START",
      },
    ]);
    expect(dump(sql)).toEqual(before);
  });
});

// #118 (R3-11): restore copies every stored value back exactly. The fixture fills every
// nullable column, both recast kinds and a scenario with every shock, so a value the
// restore drops or rewrites (e.g. the overrides rewrite) fails the dump comparison.
describe("restore keeps every stored value (#118)", () => {
  const OVERRIDES =
    '{"version":1,"appreciationPa":"0.01","rentIndexationPa":"0.02","vacancyAllowance":"0.08","postFixationResetRatePa":"0.055","inflationPa":"0.035","inflationShock":{"deltaPa":"0.02","durationYears":3},"rateShock":{"deltaPa":"0.015","durationYears":2},"valueShock":{"pct":"0.2","atYear":1}}';

  beforeEach(() => {
    sql.db.exec(`
      UPDATE properties SET appreciation_override_pa = '0.03',
        rent_index_override_pa = '0.02', own_cash = '1500000.5',
        transaction_costs = '95000', initial_works = '40000', funding_note = 'Deposit'
        WHERE id = 'javorova';
      UPDATE properties SET active = 0 WHERE id = 'dubova';
      UPDATE mortgage_blocks SET loan_term_years = 25,
        contract_maturity_date = '2046-01-17', interest_only_until = '2021-06-30',
        draws = '[{"date":"2021-03-01","amount":"100000"}]'
        WHERE id = 'm-javorova';
      UPDATE mortgage_blocks SET
        prepayments = '[{"date":"2027-02-01","amount":"100000","effect":"shortenTerm"},{"date":"2028-02-01","amount":"50000","effect":"lowerInstalment","fee":"1500"}]',
        recasts = '[{"date":"2029-02-01","instalment":"20000"}]'
        WHERE id = 'm-lipova';
      UPDATE mortgage_blocks SET loan_term_years = 30,
        recasts = '[{"date":"2030-02-01","maturity":"2050-02-01"}]'
        WHERE id = 'm-dubova';
      INSERT INTO valuations (id, property_id, valid_from, valid_to, market_value)
        VALUES ('v-javorova-old', 'javorova', '2024-01-01', '2026-05-31', '9800000');
      INSERT INTO scenarios (id, name, overrides, created_at)
        VALUES ('s-all', 'Every shock', '${OVERRIDES}', '2026-06-07T10:00:00.000Z');
    `);
  });

  it("the fixture fills every column of every table", async () => {
    const b = await exportToJson(sql, new Date());
    for (const [table, rows] of Object.entries(b.tables)) {
      const cols = sql.db
        .prepare("SELECT name FROM pragma_table_info(?)")
        .all(table) as { name: string }[];
      for (const { name } of cols)
        expect(
          (rows as Rows).some((r) => r[name] !== null),
          `${table}.${name} is filled`,
        ).toBe(true);
    }
    expect(prepareRestore(b, checkInputRules).warnings).toEqual([]);
  });

  it("a backup file restores to exactly the same rows", async () => {
    const before = dump(sql);
    const text = JSON.stringify(await exportToJson(sql, new Date()));
    await restoreFromJson(sql, parseBackupText(text), checkInputRules);
    expect(dump(sql)).toEqual(before);
  });

  it("the app reads the restored loan events and scenario", async () => {
    await restoreFromJson(
      sql,
      await exportToJson(sql, new Date()),
      checkInputRules,
    );
    const { portfolio, scenarios } = await loadState(sql);
    const block = (id: string) => portfolio.mortgages.find((m) => m.id === id)!;
    expect(block("m-javorova").draws).toHaveLength(1);
    expect(block("m-lipova").prepayments?.map((p) => p.effect)).toEqual([
      "shortenTerm",
      "lowerInstalment",
    ]);
    expect(block("m-lipova").recasts?.[0]?.instalment?.toString()).toBe(
      "20000",
    );
    expect(block("m-dubova").recasts?.[0]?.maturity).toBeDefined();
    const o = scenarios[0]!.overrides;
    expect([
      o.inflationShock?.durationYears,
      o.rateShock?.durationYears,
      o.valueShock?.atYear,
    ]).toEqual([3, 2, 1]);
  });
});

describe("restore is one transaction", () => {
  it("a failure inside the write keeps the current data", async () => {
    const before = dump(sql);
    const statements: string[] = [];
    const failing: Sql = {
      ...sql,
      execute: (q, p) => {
        statements.push(q);
        return sql.execute(q, p);
      },
      transaction: (stmts, o) =>
        sql.transaction(
          [...stmts, { query: "INSERT INTO no_such_table VALUES (1)" }],
          o,
        ),
    };
    const b = await exportToJson(sql, new Date());
    await expect(restoreFromJson(failing, b, checkInputRules)).rejects.toThrow(
      /no_such_table/,
    );
    expect(statements).toEqual([]); // nothing outside the transaction
    expect(dump(sql)).toEqual(before);
  });
});

describe("older backups are upgraded in memory", () => {
  it("restores a legacy v1 file: missing columns, flat valueShockPct", async () => {
    const b = await exportToJson(sql, new Date());
    const strip = (rows: Rows, cols: string[]) =>
      rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).filter(([k]) => !cols.includes(k)),
        ),
      );
    const legacy: BackupFile = {
      schemaVersion: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      tables: {
        ...b.tables,
        properties: strip(b.tables.properties as Rows, ["active"]),
        mortgage_blocks: strip(b.tables.mortgage_blocks as Rows, [
          "loan_term_years",
          "draws",
          "interest_only_until",
          "contract_maturity_date",
          "prepayments",
          "recasts",
        ]),
        scenarios: [
          {
            id: "s-old",
            name: "Crash",
            overrides: '{"valueShockPct":"0.2"}',
            created_at: "2025-01-01",
          },
        ],
      },
    };
    await restoreFromJson(sql, legacy, checkInputRules);
    expect(
      sql.db.prepare("SELECT DISTINCT active FROM properties").all(),
    ).toEqual([{ active: 1 }]);
    expect(sql.db.prepare("SELECT overrides FROM scenarios").get()).toEqual({
      overrides: '{"version":1,"valueShock":{"pct":"0.2","atYear":0}}',
    });
  });
});

// ADR 0123 (#107): restore reads every scenario row before anything is written. A
// scenario only has to be readable: one that breaks an engine rule restores like a saved
// one (the compare leaves it out, its next save is refused), so every backup the app
// writes stays restorable.
describe("restore reads every scenario row (ADR 0123)", () => {
  const good = {
    id: "s1",
    name: "S",
    overrides: '{"version":1}',
    created_at: "2026-01-05T10:00:00.000Z",
  };
  const withScenario = (row: Record<string, unknown>) =>
    edited("scenarios", () => [{ ...good, ...row }]);

  it.each([[null], [""], [5]])(
    "refuses created_at %j, nothing written",
    async (createdAt) => {
      const before = dump(sql);
      const bad = await withScenario({ created_at: createdAt });
      const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
      expect(e.code).toBe("BACKUP_ROWS_INVALID");
      expect(e.issues).toEqual([
        {
          table: "scenarios",
          id: "s1",
          column: "created_at",
          rule: "UNREADABLE_VALUE",
        },
      ]);
      expect(dump(sql)).toEqual(before);
    },
  );

  it("refuses a scenario without a name, nothing written", async () => {
    const before = dump(sql);
    const bad = await withScenario({ name: null });
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.issues).toEqual([
      { table: "scenarios", id: "s1", rule: "UNREADABLE_VALUE" },
    ]);
    expect(dump(sql)).toEqual(before);
  });

  it("reports unreadable overrides once", async () => {
    const bad = await withScenario({ overrides: '{"typoKey":"1"}' });
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.issues).toEqual([
      {
        table: "scenarios",
        id: "s1",
        column: "overrides",
        rule: "UNREADABLE_VALUE",
      },
    ]);
  });

  it.each([
    ['{"version":1,"vacancyAllowance":"1.5"}'],
    ['{"version":1,"valueShock":{"pct":"-0.2","atYear":0}}'],
  ])(
    "restores a scenario whose overrides %s break a rule, and its export restores",
    async (overrides) => {
      await restoreFromJson(
        sql,
        await withScenario({ overrides }),
        checkInputRules,
      );
      expect((await loadState(sql)).scenarios.map((s) => s.id)).toEqual(["s1"]);
      await restoreFromJson(
        sql,
        await exportToJson(sql, new Date()),
        checkInputRules,
      );
    },
  );

  it("restores a created_at that is not a date: the app never reads it", async () => {
    await restoreFromJson(
      sql,
      await withScenario({ created_at: "2026-13-45" }),
      checkInputRules,
    );
    expect((await loadState(sql)).scenarios.map((s) => s.id)).toEqual(["s1"]);
  });

  it("restores a valid scenario and the app reads it", async () => {
    await restoreFromJson(
      sql,
      await withScenario({
        overrides: '{"version":1,"valueShock":{"pct":"0.2","atYear":2}}',
      }),
      checkInputRules,
    );
    const state = await loadState(sql);
    expect(state.scenarios.map((s) => s.id)).toEqual(["s1"]);
    expect(state.scenarios[0]!.overrides.valueShock?.pct.toString()).toBe(
      "0.2",
    );
  });
});
