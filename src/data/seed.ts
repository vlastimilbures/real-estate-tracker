// First-run seed: the sample portfolio seed in .claude/rules/engine-parity.md. Kept here (not imported from the
// engine's test fixtures) so the data layer doesn't make the engine depend on it.
// `seedIfEmpty` inserts only when the DB has no properties yet.
import { isoDate, rate } from "../engine";
import type { Assumptions } from "../engine";
import type { Sql } from "./sql";
import {
  propertyToRow,
  mortgageBlockToRow,
  valuationToRow,
  leaseToRow,
  holdingCostToRow,
} from "./mappers";
import {
  insertStatement,
  upsertAssumptions,
  countProperties,
  SAMPLE_ACTIVE,
  SAMPLE_DISMISSED,
  SAMPLE_PROPERTY_IDS,
} from "./repositories";
import { writeSafetyBackup } from "./backup";
import { money } from "../engine";

const BASE_DATE = isoDate("2026-06-07");

export const SEED_ASSUMPTIONS: Assumptions = {
  baseDate: BASE_DATE,
  appreciationPa: rate("0.04"),
  rentIndexationPa: rate("0.03"),
  vacancyAllowance: rate("0.05"),
  postFixationResetRatePa: rate("0.045"),
  horizonYears: 30,
  inflationPa: rate("0.025"),
  defaults: {
    propertyTaxYr: money("2550"),
    insuranceYr: money("2550"),
    mgmtPctRent: rate("0.15"),
    maintPctRent: rate("0.05"),
    svjMonthly: money("1700"),
    otherYr: money("0"),
  },
};

// Per-property holding-cost override (svjMonthly 850; the rest match the defaults).
function holdingFor(propertyId: string) {
  return {
    id: `hc-${propertyId}`,
    propertyId,
    propertyTaxYr: money("2550"),
    insuranceYr: money("2550"),
    mgmtPctRent: rate("0.15"),
    maintPctRent: rate("0.05"),
    svjMonthly: money("850"),
    otherYr: money("0"),
  };
}

const PROPERTIES = [
  {
    p: {
      id: "javorova",
      name: "Byt Javorova",
      type: "3 bedroom",
      sizeM2: 71,
      purchaseDate: isoDate("2015-06-01"),
      purchasePrice: money("4080000"),
    },
    address: "Javorova 12, Praha",
    garage: true,
  },
  {
    p: {
      id: "lipova",
      name: "Byt Lipova",
      type: "1 bedroom",
      sizeM2: 55,
      purchaseDate: isoDate("2022-01-15"),
      purchasePrice: money("7225000"),
    },
    address: "Lipova 7, Praha",
    garage: false,
  },
  {
    p: {
      id: "dubova",
      name: "Byt Dubova",
      type: "1 bedroom",
      sizeM2: 47,
      purchaseDate: isoDate("2023-02-01"),
      purchasePrice: money("6375000"),
    },
    address: "Dubova 3, Praha",
    garage: true,
  },
];

const MORTGAGES = [
  {
    id: "m-javorova",
    propertyId: "javorova",
    startDate: isoDate("2021-01-17"),
    initialPrincipal: money("1912500"),
    fixationYears: 10,
    interestRatePa: rate("0.0169"),
    monthlyInstalment: money("6721.8"),
  },
  {
    id: "m-lipova",
    propertyId: "lipova",
    startDate: isoDate("2022-01-15"),
    initialPrincipal: money("5610000"),
    fixationYears: 7,
    interestRatePa: rate("0.0359"),
    monthlyInstalment: money("25567.15"),
  },
  {
    id: "m-dubova",
    propertyId: "dubova",
    startDate: isoDate("2024-03-12"),
    initialPrincipal: money("3034500"),
    fixationYears: 7,
    interestRatePa: rate("0.0449"),
    monthlyInstalment: money("21576.4"),
  },
];

const VALUATIONS = [
  {
    id: "v-javorova",
    propertyId: "javorova",
    validFrom: isoDate("2026-06-01"),
    marketValue: money("10200000"),
  },
  {
    id: "v-lipova",
    propertyId: "lipova",
    validFrom: isoDate("2026-06-01"),
    marketValue: money("8925000"),
  },
  {
    id: "v-dubova",
    propertyId: "dubova",
    validFrom: isoDate("2026-06-01"),
    marketValue: money("9605000"),
  },
];

const LEASES = [
  {
    id: "l-javorova",
    propertyId: "javorova",
    startDate: isoDate("2025-09-01"),
    monthlyRent: money("27200"),
  },
  {
    id: "l-dubova",
    propertyId: "dubova",
    startDate: isoDate("2025-07-01"),
    monthlyRent: money("21675"),
  },
  {
    id: "l-lipova-1",
    propertyId: "lipova",
    startDate: isoDate("2025-09-01"),
    endDate: isoDate("2026-08-30"),
    monthlyRent: money("21675"),
  },
  {
    id: "l-lipova-2",
    propertyId: "lipova",
    startDate: isoDate("2026-09-01"),
    monthlyRent: money("23205"),
  },
];

const HOLDING_COSTS = [
  holdingFor("javorova"),
  holdingFor("lipova"),
  holdingFor("dubova"),
];

const SEEDED_FLAG = "sample_seeded";

async function markSeeded(sql: Sql): Promise<void> {
  await sql.execute(
    "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')",
    [SEEDED_FLAG],
  );
}

/** Seed the sample portfolio on the first run only (D-16): once the `sample_seeded`
 *  flag is in `app_meta`, an empty portfolio stays empty. Assumes `migrate` has run.
 *  Always ensures the assumptions row exists — guards against partial restores
 *  that deleted assumptions but left properties intact. */
export async function seedIfEmpty(sql: Sql): Promise<boolean> {
  // Assumptions must always be present; re-insert seed defaults if missing.
  const assumptionRows = await sql.select<{ id: number }>(
    "SELECT id FROM assumptions WHERE id = 1",
  );
  if (assumptionRows.length === 0) {
    await upsertAssumptions(sql, SEED_ASSUMPTIONS);
  }

  const flag = await sql.select<{ key: string }>(
    "SELECT key FROM app_meta WHERE key = ?",
    [SEEDED_FLAG],
  );
  if (flag.length > 0) return false;
  if ((await countProperties(sql)) > 0) {
    await markSeeded(sql);
    return false;
  }
  // First-run seed: insert the sample portfolio seed (.claude/rules/engine-parity.md), in one transaction so a
  // failure leaves nothing behind and the next launch simply seeds again.
  await sql.transaction([
    ...PROPERTIES.map(({ p, address, garage }) =>
      insertStatement("properties", propertyToRow(p, { address, garage })),
    ),
    ...MORTGAGES.map((m) =>
      insertStatement("mortgage_blocks", mortgageBlockToRow(m)),
    ),
    ...VALUATIONS.map((v) => insertStatement("valuations", valuationToRow(v))),
    ...LEASES.map((l) => insertStatement("leases", leaseToRow(l))),
    ...HOLDING_COSTS.map((h) =>
      insertStatement("holding_costs", holdingCostToRow(h)),
    ),
    {
      query: "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')",
      params: [SEEDED_FLAG],
    },
    // Marks the sample for the banner and "Clear sample" (ADR 0094).
    {
      query: "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')",
      params: [SAMPLE_ACTIVE],
    },
  ]);
  return true;
}

/** "Keep exploring": hide the sample banner for good (ADR 0094). */
export async function dismissSampleBanner(sql: Sql): Promise<void> {
  await sql.execute(
    "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')",
    [SAMPLE_DISMISSED],
  );
}

/** "Clear sample and start my own" (ADR 0094): write and verify a safety backup (D-52),
 *  then in one transaction (D-14) delete the sample properties — their records go with
 *  them through ON DELETE CASCADE — and the sample markers. `sample_seeded` stays, so
 *  the sample is never reseeded. The user's own properties and the assumptions are
 *  untouched. Returns the safety backup's name. */
export async function clearSample(
  sql: Sql,
  now: Date = new Date(),
): Promise<{ safetyBackup: string }> {
  const safetyBackup = await writeSafetyBackup(
    sql,
    now,
    "portfolio-before-clear-sample",
  );
  await sql.transaction([
    {
      query: `DELETE FROM properties WHERE id IN (${SAMPLE_PROPERTY_IDS.map(() => "?").join(", ")})`,
      params: [...SAMPLE_PROPERTY_IDS],
    },
    {
      query: "DELETE FROM app_meta WHERE key IN (?, ?)",
      params: [SAMPLE_ACTIVE, SAMPLE_DISMISSED],
    },
  ]);
  return { safetyBackup };
}
