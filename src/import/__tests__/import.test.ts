// CSV import tests: parse/validate functions + parity test importing seed via CSV.
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
  propertiesTemplate,
  valuationsTemplate,
  rentsTemplate,
  mortgagesTemplate,
} from "../csv";
import { importCsv } from "../csvImport";
import { SEED_ASSUMPTIONS } from "../../data/seed";
import { portfolioSnapshot } from "../../engine";

// seed sample data as CSV strings
const PROPERTIES_CSV = `name,address,type,size_m2,garage,purchase_date,purchase_price,appreciation_override_pa,rent_index_override_pa
Byt Javorova,Javorova 12 Praha,3 bedroom,71,true,2015-06-01,4080000,,
Byt Lipova,Lipova 7 Praha,1 bedroom,55,false,2022-01-15,7225000,,
Byt Dubova,Dubova 3 Praha,1 bedroom,47,true,2023-02-01,6375000,,`;

const VALUATIONS_CSV = `property_name,valid_from,valid_to,market_value
Byt Javorova,2026-06-01,,10200000
Byt Lipova,2026-06-01,,8925000
Byt Dubova,2026-06-01,,9605000`;

const RENTS_CSV = `property_name,start_date,end_date,monthly_rent
Byt Javorova,2025-09-01,,27200
Byt Dubova,2025-07-01,,21675
Byt Lipova,2025-09-01,2026-08-30,21675
Byt Lipova,2026-09-01,,23205`;

const MORTGAGES_CSV = `property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment
Byt Javorova,2021-01-17,1912500,10,0.0169,6721.8
Byt Lipova,2022-01-15,5610000,7,0.0359,25567.15
Byt Dubova,2024-03-12,3034500,7,0.0449,21576.4`;

const ALL_NAMES = new Set(["Byt Javorova", "Byt Lipova", "Byt Dubova"]);

// --- parseProperties ---

describe("parseProperties", () => {
  it("parses 3 valid rows with correct fields", () => {
    const { rows, errors } = parseProperties(PROPERTIES_CSV);
    expect(errors, JSON.stringify(errors)).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0].name).toBe("Byt Javorova");
    expect(rows[0].purchase_price).toBe("4080000");
    expect(rows[0].purchase_date).toBe("2015-06-01");
    expect(rows[0].garage).toBe(true);
    expect(rows[0].size_m2).toBe(71);
    expect(rows[0].appreciation_override_pa).toBeNull();
    expect(rows[1].garage).toBe(false);
    expect(rows[2].size_m2).toBe(47);
  });

  it("errors on missing required name", () => {
    const { errors } = parseProperties(
      "name,purchase_date,purchase_price\n,2015-01-01,1000000",
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("name");
  });

  it("errors on missing required purchase_date", () => {
    const { errors } = parseProperties(
      "name,purchase_date,purchase_price\nTest,,1000000",
    );
    expect(errors.some((e) => e.field === "purchase_date")).toBe(true);
  });

  it("errors on invalid date format", () => {
    const { errors } = parseProperties(
      "name,purchase_date,purchase_price\nTest,31.12.2015,1000000",
    );
    expect(errors.some((e) => e.field === "purchase_date")).toBe(true);
  });

  it("errors on invalid purchase_price", () => {
    const { errors } = parseProperties(
      "name,purchase_date,purchase_price\nTest,2015-01-01,not-a-number",
    );
    expect(errors.some((e) => e.field === "purchase_price")).toBe(true);
  });

  it("errors on invalid garage boolean", () => {
    const { errors } = parseProperties(
      "name,purchase_date,purchase_price,garage\nTest,2015-01-01,1000000,maybe",
    );
    expect(errors.some((e) => e.field === "garage")).toBe(true);
  });

  it("parses a 16-digit amount losslessly (no float round-trip, CLAUDE.md §5)", () => {
    const big = "1234567890123456"; // 16 sig figs — Number() would corrupt this
    const { rows, errors } = parseProperties(
      `name,purchase_date,purchase_price\nTest,2015-01-01,${big}`,
    );
    expect(errors, JSON.stringify(errors)).toHaveLength(0);
    expect(rows[0].purchase_price).toBe(big);
  });

  it("rejects NaN/Infinity-style money strings", () => {
    for (const bad of ["NaN", "Infinity", "-Infinity"]) {
      const { errors } = parseProperties(
        `name,purchase_date,purchase_price\nTest,2015-01-01,${bad}`,
      );
      expect(
        errors.some((e) => e.field === "purchase_price"),
        bad,
      ).toBe(true);
    }
  });
});

// --- parseValuations ---

describe("parseValuations", () => {
  it("parses 3 valid rows", () => {
    const { rows, errors } = parseValuations(VALUATIONS_CSV, ALL_NAMES);
    expect(errors, JSON.stringify(errors)).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0].market_value).toBe("10200000");
    expect(rows[0].valid_to).toBeNull();
  });

  it("errors on unknown property_name when knownNames provided", () => {
    const { errors } = parseValuations(
      VALUATIONS_CSV,
      new Set(["Other Property"]),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("property_name");
  });

  it("skips FK check when knownNames not provided", () => {
    const { errors } = parseValuations(VALUATIONS_CSV);
    expect(errors, "no FK check without knownNames").toHaveLength(0);
  });
});

// --- parseRents ---

describe("parseRents", () => {
  it("parses 4 rows including one with end_date", () => {
    const { rows, errors } = parseRents(RENTS_CSV, ALL_NAMES);
    expect(errors, JSON.stringify(errors)).toHaveLength(0);
    expect(rows).toHaveLength(4);
    expect(rows[2].end_date).toBe("2026-08-30");
    expect(rows[3].end_date).toBeNull();
  });
});

// --- parseMortgages ---

describe("parseMortgages", () => {
  it("parses 3 valid rows with correct types", () => {
    const { rows, errors } = parseMortgages(MORTGAGES_CSV, ALL_NAMES);
    expect(errors, JSON.stringify(errors)).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0].fixation_years).toBe(10);
    expect(rows[0].interest_rate_pa).toBe("0.0169");
    expect(rows[0].monthly_instalment).toBe("6721.8");
  });

  it("derives the instalment when blank but loan_term_years is given", () => {
    const csv =
      "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years\n" +
      "Byt Javorova,2021-01-17,1912500,10,0.0169,,25";
    const { rows, errors } = parseMortgages(csv, ALL_NAMES);
    expect(errors, JSON.stringify(errors)).toHaveLength(0);
    expect(rows).toHaveLength(1);
    // PMT(0.0169/12, 300, −1,912,500) ≈ 7,821 Kč/mo (whole-Kč rounded).
    expect(
      Math.abs(Number(rows[0].monthly_instalment) - 7821),
    ).toBeLessThanOrEqual(2);
  });

  it("errors when instalment is blank and no loan_term_years is given", () => {
    const csv =
      "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment\n" +
      "Byt Javorova,2021-01-17,1912500,10,0.0169,";
    const { rows, errors } = parseMortgages(csv, ALL_NAMES);
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.field === "monthly_instalment")).toBe(true);
  });

  it("respects a provided instalment (no override) even with a term given", () => {
    const csv =
      "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years\n" +
      "Byt Javorova,2021-01-17,1912500,10,0.0169,6721.8,25";
    const { rows, errors } = parseMortgages(csv, ALL_NAMES);
    expect(errors, JSON.stringify(errors)).toHaveLength(0);
    expect(rows[0].monthly_instalment).toBe("6721.8");
  });
});

// --- template generators ---

describe("template generators", () => {
  it("properties template has correct header", () =>
    expect(propertiesTemplate()).toContain(
      "name,address,type,size_m2,garage,purchase_date,purchase_price",
    ));
  it("valuations template has correct header", () =>
    expect(valuationsTemplate()).toContain(
      "property_name,valid_from,valid_to,market_value",
    ));
  it("rents template has correct header", () =>
    expect(rentsTemplate()).toContain(
      "property_name,start_date,end_date,monthly_rent",
    ));
  it("mortgages template has correct header", () =>
    expect(mortgagesTemplate()).toContain(
      "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment",
    ));
  it("each template parses cleanly (example row is valid)", () => {
    expect(parseProperties(propertiesTemplate()).errors).toHaveLength(0);
    expect(parseValuations(valuationsTemplate()).errors).toHaveLength(0);
    expect(parseRents(rentsTemplate()).errors).toHaveLength(0);
    expect(parseMortgages(mortgagesTemplate()).errors).toHaveLength(0);
  });
});

// --- importCsv parity test (seed numbers via CSV) ---

let sql: TestSql;

beforeAll(async () => {
  sql = openMemorySql();
  await migrate(sql);
});

afterAll(() => sql.db.close());

describe("importCsv — parity (parity targets via CSV)", () => {
  const KC = 1;
  const RATIO = 0.0001;
  const near = (a: number, b: number, tol: number, label: string) =>
    expect(Math.abs(a - b), `${label}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);

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
    await importCsv(sql, {
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
  it("portfolio LTV", () => near(snap.ltv.toNumber(), 0.3312, RATIO, "ltv"));
  it("gross rent", () =>
    near(snap.grossAnnualRent.toNumber(), 846_600, KC, "gross"));
  it("NOI", () => near(snap.noi.toNumber(), 589_050, KC, "noi"));
  it("net cash flow", () =>
    near(snap.netCashFlow.toNumber(), -57_334.2, KC, "ncf"));
  it("DSCR", () => near(snap.dscr!.toNumber(), 0.9113, RATIO, "dscr"));
  it("weighted-avg rate", () =>
    near(snap.weightedAvgRate.toNumber(), 0.035226, RATIO, "war"));

  it("Lipova rent at baseDate is 21,675 (effective-dating)", () => {
    const w = snap.perProperty.find((p) => p.name === "Byt Lipova")!;
    near(w.grossAnnualRent.toNumber(), 21_675 * 12, KC, "lipova gross");
  });

  it("re-import is idempotent (upserts, no duplicate rows)", async () => {
    await importCsv(sql, {
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

// --- importCsv slug collision ---

describe("importCsv — slug collision", () => {
  // Two distinct names that slugify to the same base ("byt-a"); the second must get
  // a uniqued id rather than clobber the first on the primary key.
  const COLLIDING_CSV = `name,purchase_date,purchase_price
Byt A!,2020-01-01,1000000
Byt A?,2020-01-01,2000000`;

  it("gives distinct slug-colliding names distinct ids, keeps both, stays idempotent", async () => {
    const csql = openMemorySql();
    try {
      await migrate(csql);
      const { rows, errors } = parseProperties(COLLIDING_CSV);
      expect(errors, JSON.stringify(errors)).toHaveLength(0);

      await importCsv(csql, { properties: rows });
      const after = await loadPortfolio(csql);
      expect(after.properties).toHaveLength(2);
      const ids = after.properties.map((p) => p.id);
      expect(new Set(ids).size).toBe(2); // distinct ids despite same slug base

      // Re-import upserts by name (no new rows), so the count holds.
      await importCsv(csql, {
        properties: parseProperties(COLLIDING_CSV).rows,
      });
      const reimported = await loadPortfolio(csql);
      expect(reimported.properties).toHaveLength(2);
    } finally {
      csql.db.close();
    }
  });
});
