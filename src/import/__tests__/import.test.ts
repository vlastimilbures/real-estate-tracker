// The sample portfolio imported via CSV into a fresh database: the parity targets must
// survive the import (parser rules and templates are in csv.test.ts).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import {
  upsertAssumptions,
  loadPortfolio,
  loadAssumptions,
} from "../../data/repositories";
import {
  parseProperties,
  parseValuations,
  parseRents,
  parseMortgages,
} from "../csv";
import { SEED_ASSUMPTIONS } from "../../data/seed";
import { portfolioSnapshot } from "../../engine";
import { KC, RATIO, near } from "../../engine/__tests__/support/tolerance";
import {
  MORTGAGES_CSV,
  PROPERTIES_CSV,
  RENTS_CSV,
  VALUATIONS_CSV,
} from "./support/sampleCsv";
import { importNow } from "./support/importNow";

// --- importCsv parity test (seed numbers via CSV) ---

let sql: TestSql;

beforeAll(async () => {
  sql = openMemorySql();
  await migrate(sql);
});

afterAll(() => sql.db.close());

describe("importCsv — parity (parity targets via CSV)", () => {
  let snap: ReturnType<typeof portfolioSnapshot>;

  beforeAll(async () => {
    await upsertAssumptions(sql, SEED_ASSUMPTIONS);
    const propResult = parseProperties(PROPERTIES_CSV);
    const valResult = parseValuations(VALUATIONS_CSV);
    const rentResult = parseRents(RENTS_CSV);
    const mortResult = parseMortgages(MORTGAGES_CSV);
    expect(propResult.errors).toHaveLength(0);
    expect(valResult.errors).toHaveLength(0);
    expect(rentResult.errors).toHaveLength(0);
    expect(mortResult.errors).toHaveLength(0);
    await importNow(sql, {
      properties: propResult.rows,
      valuations: valResult.rows,
      rents: rentResult.rows,
      mortgages: mortResult.rows,
    });
    // CSV does not import holding costs — user sets them via UI after import.
    // seed per-property override: svjMonthly=850 (Assumptions default is 1700).
    // Set that override here to match the parity target numbers.
    await sql.execute(
      "UPDATE holding_costs SET svj_monthly = '850', property_tax_yr = '2550', insurance_yr = '2550', mgmt_pct_rent = '0.15', maint_pct_rent = '0.05', other_yr = '0'",
    );
    const portfolio = await loadPortfolio(sql);
    const assumptions = await loadAssumptions(sql);
    snap = portfolioSnapshot(portfolio, assumptions);
  });

  it("total value", () =>
    near(snap.totalValue.toNumber(), 28_730_000, KC, "value"));
  it("total debt", () =>
    near(snap.totalDebt.toNumber(), 9_515_405.13, KC, "debt"));
  it("total equity", () =>
    near(snap.totalEquity.toNumber(), 19_214_594.87, KC, "equity"));
  it("portfolio LTV", () => near(snap.ltv!.toNumber(), 0.3312, RATIO, "ltv"));
  it("gross rent", () =>
    near(snap.grossAnnualRent.toNumber(), 846_600, KC, "gross"));
  // ADR 0182 moved NOI, net cash flow and DSCR (was 589,050, −57,334.2 and 0.9113).
  it("NOI", () => near(snap.noi.toNumber(), 595_399.5, KC, "noi"));
  it("net cash flow", () =>
    near(snap.netCashFlow.toNumber(), -50_984.7, KC, "ncf"));
  it("DSCR", () => near(snap.dscr!.toNumber(), 0.92112, RATIO, "dscr"));
  it("weighted-avg rate", () =>
    near(snap.weightedAvgRate.toNumber(), 0.035226, RATIO, "war"));

  it("Lipova rent at baseDate is 21,675 (effective-dating)", () => {
    const w = snap.perProperty.find((p) => p.name === "Byt Lipova")!;
    near(w.grossAnnualRent.toNumber(), 21_675 * 12, KC, "lipova gross");
  });

  it("re-import is idempotent (upserts, no duplicate rows)", async () => {
    await importNow(sql, {
      properties: parseProperties(PROPERTIES_CSV).rows,
      valuations: parseValuations(VALUATIONS_CSV).rows,
      rents: parseRents(RENTS_CSV).rows,
      mortgages: parseMortgages(MORTGAGES_CSV).rows,
    });
    const portfolio = await loadPortfolio(sql);
    expect(portfolio.properties).toHaveLength(3);
    expect(portfolio.mortgages).toHaveLength(3);
    expect(portfolio.valuations).toHaveLength(3);
    expect(portfolio.leases).toHaveLength(4);
  });
});

// --- importCsv near-identical names ---

describe("importCsv — near-identical names", () => {
  // Two distinct names that differ only in punctuation once got the same id made from
  // the name (slug "byt-a"). Ids are random now (ADR 0127); both must still be kept.
  const COLLIDING_CSV = `name,purchase_date,purchase_price
Byt A!,2020-01-01,1000000
Byt A?,2020-01-01,2000000`;

  it("gives near-identical names distinct ids, keeps both, stays idempotent", async () => {
    const csql = openMemorySql();
    try {
      await migrate(csql);
      const { rows, errors } = parseProperties(COLLIDING_CSV);
      expect(errors, JSON.stringify(errors)).toHaveLength(0);

      await importNow(csql, { properties: rows });
      const after = await loadPortfolio(csql);
      expect(after.properties).toHaveLength(2);
      const ids = after.properties.map((p) => p.id);
      expect(new Set(ids).size).toBe(2); // distinct ids

      // Re-import upserts by name (no new rows), so the count holds.
      await importNow(csql, {
        properties: parseProperties(COLLIDING_CSV).rows,
      });
      const reimported = await loadPortfolio(csql);
      expect(reimported.properties).toHaveLength(2);
    } finally {
      csql.db.close();
    }
  });
});
