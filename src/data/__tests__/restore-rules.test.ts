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
    return Promise.resolve(args.json);
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
  const b = await exportToJson(sql);
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

    const backup = await exportToJson(sql);
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
});

describe("restore checks the flag columns (ADR 0148 §3)", () => {
  const BAD: [column: string, value: unknown][] = [
    ["garage", 2],
    ["active", 7],
    ["active", null],
    ["garage", "1"],
  ];
  for (const [column, value] of BAD)
    it.fails(
      `refuses ${column} = ${JSON.stringify(value)} at the confirm step (#133)`,
      async () => {
        // R3-04A: the write would otherwise fail on the CHECK after the safety backup.
        const backup = await edited("properties", (rows) =>
          rows.map((r) =>
            r.id === "javorova" ? { ...r, [column]: value } : r,
          ),
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
      },
    );

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
  it.fails(
    "refuses two names that match trimmed and case-insensitively (#133)",
    async () => {
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
    },
  );
});
