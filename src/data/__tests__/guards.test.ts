// DR-037 / D-48: stored rows and scenario JSON are checked when loaded. A value its
// column cannot hold is a typed DataError naming table, row and column (never the
// value) instead of a silent NaN, a rolled-over date or a raw TypeError.
import { describe, it, expect } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadPortfolio, listScenarios } from "../repositories";
import {
  rowToMortgageBlock,
  rowToProperty,
  rowToScenario,
  rowToValuation,
  scenarioToRow,
  type MortgageBlockRow,
  type PropertyRow,
  type ScenarioRow,
  type ValuationRow,
} from "../mappers";
import { DataError } from "../errors";
import { isIsoDate } from "../guards";
import { rate, isoDate } from "../../engine";

function dataError(fn: () => unknown): DataError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return e as DataError;
  }
  throw new Error("expected a DataError");
}

const valuation: ValuationRow = {
  id: "v1",
  property_id: "p1",
  valid_from: "2026-01-01",
  valid_to: null,
  market_value: "8100000",
};

const property: PropertyRow = {
  id: "p1",
  name: "Flat",
  address: null,
  type: null,
  size_m2: 55,
  garage: null,
  purchase_date: "2023-02-01",
  purchase_price: "6375000",
  appreciation_override_pa: null,
  rent_index_override_pa: null,
  active: 1,
};

const mortgage: MortgageBlockRow = {
  id: "m1",
  property_id: "p1",
  start_date: "2024-03-12",
  initial_principal: "3034500",
  fixation_years: 7,
  interest_rate_pa: "0.0449",
  monthly_instalment: "21576.4",
  loan_term_years: null,
  draws: null,
  interest_only_until: null,
  contract_maturity_date: null,
};

const scenario = (overrides: string): ScenarioRow => ({
  id: "s1",
  name: "Stress",
  overrides,
  created_at: "2026-01-05",
});

describe("row guards", () => {
  it.each(["NaN", "Infinity", "-Infinity", "abc", ""])(
    "rejects market_value %j",
    (bad) => {
      const e = dataError(() =>
        rowToValuation({ ...valuation, market_value: bad }),
      );
      expect(e.code).toBe("ROW_INVALID");
      expect(e.details).toEqual([
        "valuations v1: market_value is not a finite decimal number",
      ]);
    },
  );

  it("rejects a missing required amount", () => {
    const e = dataError(() =>
      rowToProperty({ ...property, purchase_price: null as unknown as string }),
    );
    expect(e.details).toEqual([
      "properties p1: purchase_price is not a finite decimal number",
    ]);
  });

  it.each(["2026-02-31", "2026-13-01", "garbage", "2026-1-5"])(
    "rejects date %j instead of rolling it over",
    (bad) => {
      const e = dataError(() =>
        rowToValuation({ ...valuation, valid_from: bad }),
      );
      expect(e.details).toEqual([
        "valuations v1: valid_from is not a valid yyyy-mm-dd date",
      ]);
    },
  );

  it("rejects a non-numeric integer column", () => {
    const e = dataError(() =>
      rowToMortgageBlock({
        ...mortgage,
        fixation_years: "7" as unknown as number,
      }),
    );
    expect(e.details).toEqual([
      "mortgage_blocks m1: fixation_years is not a number",
    ]);
  });

  it.each([
    ["{}", "is not an array"],
    ['[{"date":"2024-03-12","amount":"NaN"}]', "has an invalid amount"],
    ['[{"date":"2024-02-30","amount":"1"}]', "has an invalid date"],
    ["not json", "is not valid JSON"],
  ])("rejects draws %s", (draws, problem) => {
    const e = dataError(() => rowToMortgageBlock({ ...mortgage, draws }));
    expect(e.details).toEqual([`mortgage_blocks m1: draws ${problem}`]);
  });

  it("accepts valid rows unchanged, including non-canonical decimal text", () => {
    const v = rowToValuation({ ...valuation, market_value: "8100000.00" });
    expect(v.marketValue.toString()).toBe("8100000");
    expect(v.validFrom).toEqual(isoDate("2026-01-01"));
  });

  it("isIsoDate accepts leap days only in leap years", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
  });

  it("one bad row fails the load with a message naming it", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    sql.db.pragma("ignore_check_constraints = ON"); // simulate a row corrupted outside the app
    await sql.execute(
      "UPDATE leases SET monthly_rent = 'NaN' WHERE id = 'l-lipova-2'",
    );
    await expect(loadPortfolio(sql)).rejects.toThrow(
      "A saved record cannot be read: leases l-lipova-2: monthly_rent is not a finite decimal number.",
    );
  });
});

describe("scenario overrides JSON (versioned)", () => {
  it("writes version 1", () => {
    const row = scenarioToRow({
      id: "s1",
      name: "S",
      overrides: { appreciationPa: rate("0.01") },
      createdAt: isoDate("2026-01-05"),
    });
    expect(JSON.parse(row.overrides)).toEqual({
      version: 1,
      appreciationPa: "0.01",
    });
  });

  it("reads version 1 and the legacy unversioned shape", () => {
    const v1 = rowToScenario(
      scenario(
        '{"version":1,"rateShock":{"deltaPa":"0.02","durationYears":3},"valueShock":{"pct":"0.2","atYear":5}}',
      ),
    );
    expect(v1.overrides.rateShock?.durationYears).toBe(3);
    expect(v1.overrides.valueShock?.atYear).toBe(5);
    const legacy = rowToScenario(scenario('{"valueShockPct":"0.3"}'));
    expect(legacy.overrides.valueShock?.pct.toString()).toBe("0.3");
    expect(legacy.overrides.valueShock?.atYear).toBe(0);
  });

  it.each([
    ["null", "is not a JSON object"],
    ["[]", "is not a JSON object"],
    ['{"appreciationPa":0.05}', "appreciationPa is not a decimal string"],
    ['{"typoKey":"1"}', 'has an unknown key "typoKey"'],
    [
      '{"rateShock":{"deltaPa":"0.02","durationYears":"3"}}',
      "rateShock is not {deltaPa, durationYears}",
    ],
    ['{"valueShock":{"atYear":2}}', "valueShock is not {pct, atYear}"],
    ['{"version":2}', "has unsupported version 2"],
    [
      '{"version":1,"valueShockPct":"0.3"}',
      'has an unknown key "valueShockPct"',
    ],
  ])("rejects %s", (json, problem) => {
    const e = dataError(() => rowToScenario(scenario(json)));
    expect(e.code).toBe("SCENARIO_INVALID");
    expect(e.details).toEqual([`scenario "Stress": overrides ${problem}`]);
  });

  it("keeps the existing message for unparseable JSON", () => {
    const e = dataError(() => rowToScenario(scenario("{not valid json")));
    expect(e.code).toBe("SCENARIO_INVALID");
    expect(e.message).toMatch(/Corrupt scenario overrides JSON for "Stress"/);
  });

  it("a stored scenario with a numeric value no longer loads silently without it", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await sql.execute(
      `INSERT INTO scenarios VALUES ('s1', 'Stress', '{"appreciationPa":0.05}', '2026-01-05')`,
    );
    await expect(listScenarios(sql)).rejects.toBeInstanceOf(DataError);
  });
});
