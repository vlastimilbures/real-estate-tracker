// The restore plan on its own (#471): backup/restorePlan.ts is pure, so it is checked here
// with hand-built files and stub rules — no database, no Tauri bridge.
import { describe, expect, it } from "vitest";
import { prepareRestore, type InputRules } from "../backup/restorePlan";
import { validateBackup } from "../backup/validate";
import { SCHEMA_HEAD, type BackupFile } from "../backup/format";
import { DELETE_SAMPLE_MARKERS } from "../repositories";
import { assumptionsToRow } from "../mappers";
import { isoDate, money, rate, type Assumptions } from "../../engine";

const ASSUMPTIONS: Assumptions = {
  baseDate: isoDate("2026-01-01"),
  appreciationPa: rate("0.03"),
  rentIndexationPa: rate("0.02"),
  vacancyAllowance: rate("0.05"),
  postFixationResetRatePa: rate("0.05"),
  horizonYears: 30,
  inflationPa: rate("0.02"),
  defaults: {
    propertyTaxYr: money("1000"),
    insuranceYr: money("2000"),
    mgmtPctRent: rate("0.1"),
    maintPctRent: rate("0.05"),
    svjMonthly: money("1500"),
    otherYr: money("0"),
  },
};

const property = (id: string, name: string) => ({
  id,
  name,
  address: null,
  type: null,
  size_m2: 50,
  garage: null,
  purchase_date: "2020-01-01",
  purchase_price: "3000000",
  appreciation_override_pa: null,
  rent_index_override_pa: null,
  active: 1,
  own_cash: null,
  transaction_costs: null,
  initial_works: null,
  funding_note: null,
});

function file(
  tables: Partial<Record<string, Record<string, unknown>[]>> = {},
): BackupFile {
  return {
    schemaVersion: SCHEMA_HEAD,
    exportedAt: "2026-11-25T10:00:00.000Z",
    tables: {
      properties: [property("p1", "Flat")],
      mortgage_blocks: [],
      valuations: [],
      leases: [
        {
          id: "l1",
          property_id: "p1",
          start_date: "2021-01-01",
          end_date: null,
          monthly_rent: "15000",
        },
      ],
      holding_costs: [],
      assumptions: [{ ...assumptionsToRow(ASSUMPTIONS) }],
      scenarios: [],
      ...tables,
    } as BackupFile["tables"],
  };
}

const noRules: InputRules = () => [];

describe("restore plan (pure)", () => {
  it("wipes children first, inserts parents first, then clears the sample markers", () => {
    const { statements } = prepareRestore(file(), noRules);
    expect(statements.map((s) => s.query.split(" (")[0])).toEqual([
      "DELETE FROM scenarios",
      "DELETE FROM assumptions",
      "DELETE FROM holding_costs",
      "DELETE FROM leases",
      "DELETE FROM valuations",
      "DELETE FROM mortgage_blocks",
      "DELETE FROM properties",
      "INSERT INTO properties",
      "INSERT INTO leases",
      "INSERT INTO assumptions",
      "DELETE FROM app_meta WHERE key IN",
    ]);
    expect(statements.at(-1)).toBe(DELETE_SAMPLE_MARKERS);
  });

  it("validateBackup returns the object it was given", () => {
    const b = file();
    expect(validateBackup(b)).toBe(b);
  });

  it("lists unreadable rows in table order and does not run the rules then", () => {
    let ran = false;
    const rules: InputRules = () => {
      ran = true;
      return [];
    };
    const bad = file({
      properties: [{ ...property("p1", "Flat"), purchase_price: "x" }],
      leases: [
        {
          id: "l1",
          property_id: "p1",
          start_date: "nope",
          end_date: null,
          monthly_rent: "1",
        },
      ],
      assumptions: [],
    });
    expect(() => prepareRestore(bad, rules)).toThrow(
      expect.objectContaining({
        code: "BACKUP_ROWS_INVALID",
        issues: [
          { table: "properties", id: "p1", rule: "UNREADABLE_VALUE" },
          { table: "leases", id: "l1", rule: "UNREADABLE_VALUE" },
          { table: "assumptions", rule: "MISSING_ASSUMPTIONS" },
        ],
      }),
    );
    expect(ran).toBe(false);
  });

  it("a range problem alone comes back as a warning with the statements", () => {
    const rules: InputRules = () => [
      {
        code: "OUT_OF_RANGE",
        entity: "assumptions",
        id: undefined,
        field: "horizonYears",
        range: { min: 1, max: 100 },
      },
    ];
    const plan = prepareRestore(file(), rules);
    expect(plan.warnings).toEqual([
      {
        table: "assumptions",
        column: "horizon_years",
        rule: "OUT_OF_RANGE",
        range: { min: 1, max: 100 },
      },
    ]);
    expect(plan.summary.counts).toEqual({
      properties: 1,
      mortgage_blocks: 0,
      valuations: 0,
      leases: 1,
      holding_costs: 0,
      assumptions: 1,
      scenarios: 0,
    });
  });

  it("a duplicate natural key is found before the rules' issues", () => {
    const rules: InputRules = () => [
      { code: "LEASE_OVERLAP", entity: "lease", id: "l1", field: "startDate" },
    ];
    const dup = file({
      properties: [property("p1", "Flat"), property("p2", " flat ")],
    });
    expect(() => prepareRestore(dup, rules)).toThrow(
      expect.objectContaining({
        issues: [
          {
            table: "properties",
            id: "p2",
            column: "name",
            rule: "DUPLICATE_KEY",
          },
          {
            table: "leases",
            id: "l1",
            column: "start_date",
            rule: "LEASE_OVERLAP",
          },
        ],
      }),
    );
  });
});
