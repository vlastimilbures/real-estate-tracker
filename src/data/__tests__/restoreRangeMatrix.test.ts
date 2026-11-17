// #464: today's restore outcome for each bounded field at and past its bounds, pinned
// with literal values so moving the input rules into one module cannot change them.
// Up to ten times the form maximum asks (OUT_OF_RANGE), beyond it refuses
// (BEYOND_LIMIT); an engine rule on the same field reports instead (ADR 0148).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import {
  exportToJson,
  prepareRestore,
  RestoreError,
  type BackupFile,
  type RestoreIssue,
} from "../backup";
import { checkInputRules } from "../../state/restoreRules";
import { restoreIssueText } from "../../ui/model/restoreIssue";
import { en } from "../../i18n/en";

let sql: TestSql;

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
});

afterEach(() => sql.db.close());

type Rows = Record<string, unknown>[];

/** The seeded backup with the first row of `table` given `patch`. */
async function withFirst(
  table: string,
  patch: Record<string, unknown>,
): Promise<{ backup: BackupFile; id: string }> {
  const b = await exportToJson(sql, new Date());
  const rows = (b.tables[table] as Rows).map((r) => ({ ...r }));
  rows[0] = { ...rows[0], ...patch };
  return {
    backup: { ...b, tables: { ...b.tables, [table]: rows } },
    id: String(rows[0]!.id),
  };
}

/** The restore's issues: its warnings, or the issues it refused with. */
function outcome(backup: BackupFile): {
  refused: boolean;
  issues: RestoreIssue[];
} {
  try {
    return {
      refused: false,
      issues: prepareRestore(backup, checkInputRules).warnings,
    };
  } catch (e) {
    expect(e).toBeInstanceOf(RestoreError);
    return { refused: true, issues: (e as RestoreError).issues };
  }
}

const range = (min: number, max: number) => ({ min, max });

describe("the horizon at restore", () => {
  it("0 reports the engine rule only", async () => {
    const { backup } = await withFirst("assumptions", { horizon_years: 0 });
    expect(outcome(backup)).toEqual({
      refused: true,
      issues: [
        {
          table: "assumptions",
          column: "horizon_years",
          rule: "HORIZON_NOT_POSITIVE",
        },
      ],
    });
  });

  it("101 and 1000 warn; 1001 refuses", async () => {
    for (const [years, refused, rule] of [
      [101, false, "OUT_OF_RANGE"],
      [1000, false, "OUT_OF_RANGE"],
      [1001, true, "BEYOND_LIMIT"],
    ] as const) {
      const { backup } = await withFirst("assumptions", {
        horizon_years: years,
      });
      expect(outcome(backup), String(years)).toEqual({
        refused,
        issues: [
          {
            table: "assumptions",
            column: "horizon_years",
            rule,
            range: range(1, 100),
          },
        ],
      });
    }
  });
});

describe("the fixation and loan term at restore", () => {
  it("fixation 500 warns; 501 refuses", async () => {
    for (const [years, refused, rule] of [
      [500, false, "OUT_OF_RANGE"],
      [501, true, "BEYOND_LIMIT"],
    ] as const) {
      const { backup, id } = await withFirst("mortgage_blocks", {
        fixation_years: years,
      });
      expect(outcome(backup), String(years)).toEqual({
        refused,
        issues: [
          {
            table: "mortgage_blocks",
            id,
            column: "fixation_years",
            rule,
            range: range(0, 50),
          },
        ],
      });
    }
  });

  it("term 0 and 0.5 report INVALID_TERM once", async () => {
    for (const term of [0, 0.5]) {
      const { backup, id } = await withFirst("mortgage_blocks", {
        loan_term_years: term,
      });
      expect(outcome(backup), String(term)).toEqual({
        refused: true,
        issues: [
          {
            table: "mortgage_blocks",
            id,
            column: "loan_term_years",
            rule: "INVALID_TERM",
          },
        ],
      });
    }
  });
});

describe("the size at restore", () => {
  it("100000 and 54.55 warn; 100000.1 refuses", async () => {
    for (const [size, refused, rule] of [
      [100000, false, "OUT_OF_RANGE"],
      [54.55, false, "OUT_OF_RANGE"],
      [100000.1, true, "BEYOND_LIMIT"],
    ] as const) {
      const { backup, id } = await withFirst("properties", { size_m2: size });
      expect(outcome(backup), String(size)).toEqual({
        refused,
        issues: [
          {
            table: "properties",
            id,
            column: "size_m2",
            rule,
            range: range(1, 10000),
          },
        ],
      });
    }
  });
});

describe("a scenario shock duration at restore", () => {
  it("0 and 500 restore with no issue", async () => {
    for (const years of [0, 500]) {
      const b = await exportToJson(sql, new Date());
      const scenarios = [
        ...(b.tables.scenarios as Rows),
        {
          id: "s-long",
          name: "Long",
          overrides: `{"version":1,"rateShock":{"deltaPa":"0.01","durationYears":${years}}}`,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ];
      const backup = { ...b, tables: { ...b.tables, scenarios } };
      expect(outcome(backup), String(years)).toEqual({
        refused: false,
        issues: [],
      });
    }
  });
});

describe("the restore issue text (English)", () => {
  it("names the range, never the value", () => {
    const text = (i: RestoreIssue) => restoreIssueText(en, i);
    expect(
      text({
        table: "assumptions",
        column: "horizon_years",
        rule: "OUT_OF_RANGE",
        range: range(1, 100),
      }),
    ).toBe("Must be a whole number from 1 to 100");
    expect(
      text({
        table: "mortgage_blocks",
        column: "fixation_years",
        rule: "BEYOND_LIMIT",
        range: range(0, 50),
      }),
    ).toBe("Must be a whole number from 0 to 50");
    expect(
      text({
        table: "properties",
        column: "size_m2",
        rule: "OUT_OF_RANGE",
        range: range(1, 10000),
      }),
    ).toBe("Must be a number from 1 to 10 000 with at most one decimal place");
    expect(
      text({
        table: "assumptions",
        column: "horizon_years",
        rule: "HORIZON_NOT_POSITIVE",
      }),
    ).toBe("The projection horizon must be at least one year");
    expect(
      text({
        table: "mortgage_blocks",
        column: "loan_term_years",
        rule: "INVALID_TERM",
      }),
    ).toBe("The term in years is not valid");
  });
});
