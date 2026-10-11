// ADR 0148 (#133): restore rules vs stored data. A value outside the form bounds that the
// database already holds asks at restore instead of refusing, so the app's own safety
// backups and exports restore; restore checks the flag columns no mapper reads, and
// property names repeat case-insensitively (D-55).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { clearSample, seedIfEmpty } from "../seed";
import { loadState } from "../repositories";
import {
  BACKUP_COLUMNS,
  confirmRestore,
  exportToJson,
  parseBackupText,
  prepareRestore,
  RestoreError,
  type BackupFile,
} from "../backup";
import { checkInputRules } from "../../import/inputRules";
import { validateInputs } from "../../engine";

/** Safety backups the fake `write_app_backup` command wrote, by file name. */
const written = vi.hoisted(() => new Map<string, string>());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string, args: { filename: string; json: string }) => {
    if (command !== "write_app_backup")
      return Promise.reject(new Error(`unexpected command ${command}`));
    written.set(args.filename, args.json);
    return Promise.resolve();
  }),
}));

let sql: TestSql;

beforeEach(async () => {
  written.clear();
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
});

afterEach(() => sql.db.close());

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

function refusal(backup: BackupFile): RestoreError {
  let e: unknown = null;
  try {
    prepareRestore(backup, checkInputRules);
  } catch (err) {
    e = err;
  }
  expect(e).toBeInstanceOf(RestoreError);
  return e as RestoreError;
}

const firstBlock = () =>
  (
    sql.db.prepare("SELECT MIN(id) AS id FROM mortgage_blocks").get() as {
      id: string;
    }
  ).id;

describe("stored out-of-range values ask at restore (ADR 0148 §1)", () => {
  it("the app's own export of legacy out-of-range data restores with warnings (#133)", async () => {
    // G2-4-4: the database holds values the forms no longer accept; it loads and computes.
    sql.db
      .prepare("UPDATE properties SET size_m2 = 0 WHERE id = 'javorova'")
      .run();
    const block = firstBlock();
    sql.db
      .prepare("UPDATE mortgage_blocks SET fixation_years = 60 WHERE id = ?")
      .run(block);
    const { portfolio, assumptions } = await loadState(sql);
    expect(validateInputs(portfolio, assumptions)).toEqual([]);

    const backup = await exportToJson(sql, new Date());
    expect(() => prepareRestore(backup, checkInputRules)).not.toThrow();
    expect(prepareRestore(backup, checkInputRules)).toMatchObject({
      warnings: [
        {
          table: "properties",
          id: "javorova",
          column: "size_m2",
          rule: "OUT_OF_RANGE",
          range: { min: 1, max: 10_000 },
        },
        {
          table: "mortgage_blocks",
          id: block,
          column: "fixation_years",
          rule: "OUT_OF_RANGE",
          range: { min: 0, max: 50 },
        },
      ],
    });
  });

  it("confirming a restore with warnings replaces the data (#133)", async () => {
    const backup = await edited("assumptions", (rows) =>
      rows.map((r) => ({ ...r, horizon_years: 150 })),
    );
    await confirmRestore(sql, backup, checkInputRules);
    const { assumptions } = await loadState(sql);
    expect(assumptions.horizonYears).toBe(150);
    expect(written.size).toBe(1);
  });

  it("the safety backup Clear sample writes restores (#133)", async () => {
    // G2-4-01A: the undo path of Clear sample, with a legacy 150-year horizon.
    sql.db.prepare("UPDATE assumptions SET horizon_years = 150").run();
    const { safetyBackup } = await clearSample(sql);
    const text = written.get(safetyBackup);
    expect(text).toBeDefined();
    const backup = parseBackupText(text ?? "");
    expect(() => prepareRestore(backup, checkInputRules)).not.toThrow();
    expect(prepareRestore(backup, checkInputRules)).toMatchObject({
      warnings: [
        {
          table: "assumptions",
          column: "horizon_years",
          rule: "OUT_OF_RANGE",
        },
      ],
    });
  });

  it("a file with a blocking issue is refused and lists its out-of-range values too", async () => {
    const backup = await edited("properties", (rows) =>
      rows.map((r) =>
        r.id === "javorova"
          ? { ...r, size_m2: 20_000, purchase_price: "-1" }
          : r,
      ),
    );
    const e = refusal(backup);
    expect(e.code).toBe("BACKUP_ROWS_INVALID");
    expect(e.issues.map((i) => `${i.column}:${i.rule}`).sort()).toEqual([
      "purchase_price:NEGATIVE_AMOUNT",
      "size_m2:OUT_OF_RANGE",
    ]);
  });

  // Review P2-1: an absurd value (a hand-edited 2 000 000 000-year horizon) would make
  // every projection loop for ever after a "Restore anyway". Above ten times the form
  // maximum, restore still refuses.
  const LIMITS: [table: string, column: string, limit: number][] = [
    ["assumptions", "horizon_years", 1000],
    ["mortgage_blocks", "fixation_years", 500],
    ["mortgage_blocks", "loan_term_years", 500],
    ["properties", "size_m2", 100_000],
  ];
  for (const [table, column, limit] of LIMITS)
    it(`${table}.${column} above ${limit} is refused, at ${limit} it asks (#133)`, async () => {
      const set = (n: number) =>
        edited(table, (rows) =>
          rows.map((r, i) => (i === 0 ? { ...r, [column]: n } : r)),
        );
      const e = refusal(await set(limit + 1));
      expect(e.issues.map((i) => `${i.column}:${i.rule}`)).toEqual([
        `${column}:BEYOND_LIMIT`,
      ]);
      expect(
        prepareRestore(await set(limit), checkInputRules).warnings.map(
          (i) => `${i.column}:${i.rule}`,
        ),
      ).toEqual([`${column}:OUT_OF_RANGE`]);
    });
});

describe("restore checks the flag columns (ADR 0148 §3)", () => {
  const BAD: [column: string, value: unknown][] = [
    ["garage", 2],
    ["active", 7],
    ["active", null],
    ["garage", "1"],
  ];
  for (const [column, value] of BAD)
    it(`refuses ${column} = ${JSON.stringify(value)} at the confirm step (#133)`, async () => {
      // R3-04A: the write would otherwise fail on the CHECK after the safety backup.
      const backup = await edited("properties", (rows) =>
        rows.map((r) => (r.id === "javorova" ? { ...r, [column]: value } : r)),
      );
      const e = refusal(backup);
      expect(e.issues).toEqual([
        {
          table: "properties",
          id: "javorova",
          column,
          rule: "UNREADABLE_VALUE",
        },
      ]);
    });

  it("accepts garage 0, 1 or empty and active 0 or 1", async () => {
    const backup = await edited("properties", (rows) =>
      rows.map((r, n) => ({
        ...r,
        garage: [0, 1, null][n % 3] ?? null,
        active: n % 2,
      })),
    );
    expect(() => prepareRestore(backup, checkInputRules)).not.toThrow();
  });

  it("a backup without the active column still restores it as 1", async () => {
    const backup = await edited("properties", (rows) =>
      rows.map((r) => {
        const rest = { ...r };
        delete rest.active;
        return rest;
      }),
    );
    expect(() => prepareRestore(backup, checkInputRules)).not.toThrow();
  });
});

describe("property names repeat case-insensitively at restore (ADR 0148 §5)", () => {
  it("refuses two names that match trimmed and case-insensitively (#133)", async () => {
    // R6-3: "Byt A" and " byt a" would both restore; CSV rows for either land on one.
    const backup = await edited("properties", (rows) =>
      rows.map((r, n) =>
        n === 0
          ? { ...r, name: "Byt A" }
          : n === 1
            ? { ...r, name: " byt a" }
            : r,
      ),
    );
    const second = (backup.tables.properties as Rows)[1]?.id;
    const e = refusal(backup);
    expect(e.issues).toEqual([
      {
        table: "properties",
        id: second,
        column: "name",
        rule: "DUPLICATE_KEY",
      },
    ]);
  });
});

/** Every issue of a backup, refused or restored with warnings. */
function issuesOf(backup: BackupFile) {
  try {
    return prepareRestore(backup, checkInputRules).warnings;
  } catch (e) {
    if (e instanceof RestoreError) return e.issues;
    throw e;
  }
}

describe("the restore table names the stored column (ADR 0180 §1)", () => {
  it("a mortgage completion date reads interest_only_until (#263)", async () => {
    const block = firstBlock();
    const backup = await edited("mortgage_blocks", (rows) =>
      rows.map((r) =>
        r.id === block ? { ...r, interest_only_until: "1850-01-01" } : r,
      ),
    );
    const issues = issuesOf(backup).filter(
      (i) => i.rule === "EARLY_DATE" || i.rule === "COMPLETION_BEFORE_START",
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((i) => i.column)).toEqual(
      issues.map(() => "interest_only_until"),
    );
  });

  it("an assumption default reads its default_ column (#263)", async () => {
    const backup = await edited("assumptions", (rows) =>
      rows.map((r) => ({ ...r, default_property_tax_yr: "-1" })),
    );
    expect(refusal(backup).issues.map((i) => i.column)).toEqual([
      "default_property_tax_yr",
    ]);
  });

  it("every column an issue names is a column of its table", async () => {
    // Break every engine-checked value the seed holds, so each field restore can report
    // is mapped once; a renamed column fails here.
    let backup = await edited("assumptions", (rows) =>
      rows.map((r) => {
        const out = { ...r };
        for (const c of BACKUP_COLUMNS.assumptions)
          if (c !== "id" && c !== "base_date" && c !== "horizon_years")
            out[c] = "-5";
        return { ...out, base_date: "1850-01-01", horizon_years: 0 };
      }),
    );
    const block = firstBlock();
    const tables = { ...backup.tables };
    tables.mortgage_blocks = (tables.mortgage_blocks as Rows).map((r) =>
      r.id === block
        ? {
            ...r,
            initial_principal: "-1",
            interest_rate_pa: "-1",
            monthly_instalment: "-1",
            fixation_years: -1,
            loan_term_years: 0,
            interest_only_until: "1850-01-01",
            contract_maturity_date: "1850-01-01",
          }
        : r,
    );
    tables.holding_costs = (tables.holding_costs as Rows).map((r) => ({
      ...r,
      property_tax_yr: "-1",
      insurance_yr: "-1",
      mgmt_pct_rent: "-1",
      maint_pct_rent: "-1",
      svj_monthly: "-1",
      other_yr: "-1",
    }));
    tables.properties = (tables.properties as Rows).map((r) => ({
      ...r,
      purchase_price: "-1",
      own_cash: "-1",
      transaction_costs: "-1",
      initial_works: "-1",
      appreciation_override_pa: "-5",
      rent_index_override_pa: "-5",
      size_m2: 0,
    }));
    tables.valuations = (tables.valuations as Rows).map((r) => ({
      ...r,
      market_value: "-1",
      valid_to: "1850-01-01",
    }));
    tables.leases = (tables.leases as Rows).map((r) => ({
      ...r,
      monthly_rent: "-1",
      end_date: "1850-01-01",
    }));
    backup = { ...backup, tables };
    const issues = issuesOf(backup);
    expect(issues.length).toBeGreaterThan(20);
    const columns = BACKUP_COLUMNS as Record<string, readonly string[]>;
    const unknown = issues.filter(
      (i) =>
        i.column !== undefined &&
        !i.column.split(", ").every((c) => columns[i.table]?.includes(c)),
    );
    expect(unknown).toEqual([]);
  });
});
