// ADR 0094: the first-run sample is marked as such, and "Clear sample" removes only the
// sample properties (with every record under them) after a verified safety backup, in
// one transaction. The sample is never reseeded afterwards. ADR 0112: the user can load it
// again on demand, only into an empty portfolio.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import {
  clearSample,
  dismissSampleBanner,
  loadSample,
  SampleNotEmptyError,
  seedIfEmpty,
} from "../seed";
import {
  confirmRestore,
  exportToJson,
  restoreFromJson,
  SafetyBackupError,
} from "../backup";
import { checkInputRules } from "../../import/inputRules";
import {
  insertLease,
  insertPropertyWithCosts,
  loadAssumptions,
  loadPortfolio,
  loadState,
  upsertAssumptions,
} from "../repositories";
import { holdingCostToRow, leaseToRow, propertyToRow } from "../mappers";
import type { Sql } from "../sql";
import { isoDate, rate } from "../../engine";

/** Safety backups the fake `write_app_backup` command wrote, by file name. */
const written = vi.hoisted(() => new Map<string, string>());
const disk = vi.hoisted(() => ({ fail: false }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string, args: { filename: string; json: string }) => {
    if (command !== "write_app_backup")
      return Promise.reject(new Error(`unexpected command ${command}`));
    if (disk.fail) return Promise.reject("No space left on device");
    written.set(args.filename, args.json);
    return Promise.resolve(args.json);
  }),
}));

const NOW = new Date(Date.UTC(2026, 9, 3, 12, 30, 0));
const SAMPLE = ["dubova", "javorova", "lipova"];

/** Wraps a Sql so that any transaction statement matching `pattern` fails, failing the
 *  whole transaction (as in atomic-writes.test.ts). */
function failOn(inner: TestSql, pattern: RegExp): Sql {
  const boom = { query: "INSERT INTO no_such_table VALUES (1)" };
  return {
    ...inner,
    transaction: (statements, options) =>
      inner.transaction(
        statements.map((s) => (pattern.test(s.query) ? boom : s)),
        options,
      ),
  };
}

const meta = async (sql: Sql) =>
  (
    await sql.select<{ key: string }>("SELECT key FROM app_meta ORDER BY key")
  ).map((r) => r.key);

const ids = async (sql: Sql, table: string) =>
  (await sql.select<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`)).map(
    (r) => r.id,
  );

/** A first-run database with the sample, plus one property of the user's own (with a
 *  lease) and one lease the user added under a sample property. */
async function withOwnData(): Promise<TestSql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  const p = await loadPortfolio(sql);
  const sampleProperty = p.properties.find((x) => x.id === "javorova")!;
  const sampleCost = p.holdingCosts.find((x) => x.propertyId === "javorova")!;
  const sampleLease = p.leases.find((x) => x.propertyId === "javorova")!;
  await insertPropertyWithCosts(
    sql,
    propertyToRow({ ...sampleProperty, id: "mine", name: "My flat" }),
    holdingCostToRow({ ...sampleCost, id: "hc-mine", propertyId: "mine" }),
  );
  await insertLease(
    sql,
    leaseToRow({ ...sampleLease, id: "l-mine", propertyId: "mine" }),
  );
  await insertLease(
    sql,
    leaseToRow({
      ...sampleLease,
      id: "l-javorova-user",
      startDate: isoDate("2027-01-01"),
    }),
  );
  return sql;
}

beforeEach(() => {
  written.clear();
  disk.fail = false;
});

describe("sample marker (ADR 0094)", () => {
  it("the first-run seed marks the sample as active", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    expect(await meta(sql)).toEqual(["sample_active", "sample_seeded"]);
    expect((await loadState(sql)).sample).toEqual({
      active: true,
      dismissed: false,
    });
  });

  it("a failed seed leaves no marker", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await expect(
      seedIfEmpty(failOn(sql, /INSERT INTO leases/)),
    ).rejects.toThrow();
    expect(await meta(sql)).toEqual([]);
  });

  it("an existing install without the marker shows no sample", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    // Seeded before ADR 0094: only `sample_seeded` was written.
    await sql.execute("DELETE FROM app_meta WHERE key = 'sample_active'");
    expect((await loadState(sql)).sample.active).toBe(false);
  });

  it("data present without any flag (pre-flag install) is never marked as sample", async () => {
    const sql = await withOwnData();
    await sql.execute("DELETE FROM app_meta");
    await seedIfEmpty(sql);
    expect(await meta(sql)).toEqual(["sample_seeded"]);
  });

  it("is inactive once the user deleted every sample property by hand", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    await sql.execute("DELETE FROM properties");
    expect((await loadState(sql)).sample.active).toBe(false);
  });

  it("dismissing the banner is remembered and keeps the sample active", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    await dismissSampleBanner(sql);
    await dismissSampleBanner(sql); // idempotent
    expect((await loadState(sql)).sample).toEqual({
      active: true,
      dismissed: true,
    });
  });
});

describe("clearSample (ADR 0094)", () => {
  it("removes only the sample properties and everything under them", async () => {
    const sql = await withOwnData();
    const assumptions = await loadAssumptions(sql);
    await dismissSampleBanner(sql);

    const { safetyBackup } = await clearSample(sql, NOW);

    expect(await ids(sql, "properties")).toEqual(["mine"]);
    expect(await ids(sql, "leases")).toEqual(["l-mine"]);
    expect(await ids(sql, "holding_costs")).toEqual(["hc-mine"]);
    expect(await ids(sql, "mortgage_blocks")).toEqual([]);
    expect(await ids(sql, "valuations")).toEqual([]);
    expect(await loadAssumptions(sql)).toEqual(assumptions);
    expect(await meta(sql)).toEqual(["sample_seeded"]);
    expect((await loadState(sql)).sample).toEqual({
      active: false,
      dismissed: false,
    });
    expect(safetyBackup).toBe(
      "portfolio-before-clear-sample-20261003T123000Z.json",
    );
  });

  it("writes the safety backup of the data before the clear", async () => {
    const sql = await withOwnData();
    const { safetyBackup } = await clearSample(sql, NOW);
    const backup = JSON.parse(written.get(safetyBackup)!) as {
      tables: { properties: { id: string }[]; leases: { id: string }[] };
    };
    expect(backup.tables.properties.map((r) => r.id).sort()).toEqual(
      [...SAMPLE, "mine"].sort(),
    );
    expect(backup.tables.leases.map((r) => r.id)).toContain("l-javorova-user");
  });

  it("never reseeds the sample on the next launch", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    await clearSample(sql, NOW);
    await migrate(sql);
    expect(await seedIfEmpty(sql)).toBe(false);
    expect(await ids(sql, "properties")).toEqual([]);
  });

  it("deletes nothing when the safety backup fails", async () => {
    const sql = await withOwnData();
    disk.fail = true;
    await expect(clearSample(sql, NOW)).rejects.toBeInstanceOf(
      SafetyBackupError,
    );
    expect(await ids(sql, "properties")).toEqual([...SAMPLE, "mine"].sort());
    expect(await meta(sql)).toEqual(["sample_active", "sample_seeded"]);
  });

  it("a failure in the clear transaction leaves the data and the marker unchanged", async () => {
    const sql = await withOwnData();
    await expect(
      clearSample(failOn(sql, /DELETE FROM app_meta/), NOW),
    ).rejects.toThrow();
    expect(await ids(sql, "properties")).toEqual([...SAMPLE, "mine"].sort());
    expect(await ids(sql, "leases")).toContain("l-javorova-user");
    expect(await meta(sql)).toEqual(["sample_active", "sample_seeded"]);
  });
});

describe("the sample is matched by id and name (ADR 0127)", () => {
  /** A first-run database where the user deleted the sample flat `id` and added their own
   *  flat `name`, which got the same id from its name before ADR 0127, with a lease. */
  async function ownFlatWithSampleId(id: string, name: string) {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    const p = await loadPortfolio(sql);
    const flat = p.properties.find((x) => x.id === id)!;
    const cost = p.holdingCosts.find((x) => x.propertyId === id)!;
    const lease = p.leases.find((x) => x.propertyId === id)!;
    await sql.execute(`DELETE FROM properties WHERE id = '${id}'`);
    await insertPropertyWithCosts(
      sql,
      propertyToRow({ ...flat, name }),
      holdingCostToRow(cost),
    );
    await insertLease(sql, leaseToRow({ ...lease, id: `l-own-${id}` }));
    return sql;
  }

  it("Clear sample keeps an own flat that holds a sample id", async () => {
    const sql = await ownFlatWithSampleId("dubova", "Dubová");
    await clearSample(sql, NOW);
    expect(await ids(sql, "properties")).toEqual(["dubova"]);
    expect(await ids(sql, "leases")).toEqual(["l-own-dubova"]);
  });

  it("an own flat with a sample id does not count as the sample", async () => {
    const sql = await ownFlatWithSampleId("lipova", "Lipová");
    await sql.execute("DELETE FROM properties WHERE id <> 'lipova'");
    expect((await loadState(sql)).sample.active).toBe(false);
  });

  it("Clear sample keeps a sample flat the user renamed", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    await sql.execute(
      "UPDATE properties SET name = 'Můj byt' WHERE id = 'javorova'",
    );
    await clearSample(sql, NOW);
    expect(await ids(sql, "properties")).toEqual(["javorova"]);
  });
});

describe("restore and the sample (ADR 0127)", () => {
  /** A backup of the owner's own data: their flat "Lipová", whose id came from its name. */
  async function ownBackup() {
    const own = openMemorySql();
    await migrate(own);
    await seedIfEmpty(own);
    await own.execute("DELETE FROM properties WHERE id <> 'lipova'");
    await own.execute(
      "UPDATE properties SET name = 'Lipová' WHERE id = 'lipova'",
    );
    return exportToJson(own);
  }

  /** A new Mac: the first launch seeded the sample, and its banner was dismissed. */
  async function freshInstall(): Promise<TestSql> {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    await dismissSampleBanner(sql);
    return sql;
  }

  it("a restore clears the sample markers, so the owner's data is not a sample", async () => {
    const sql = await freshInstall();
    await confirmRestore(sql, await ownBackup(), checkInputRules);
    expect(await meta(sql)).toEqual(["sample_seeded"]);
    expect((await loadState(sql)).sample).toEqual({
      active: false,
      dismissed: false,
    });
  });

  it("so does a restore without a safety backup", async () => {
    const sql = await freshInstall();
    await restoreFromJson(sql, await ownBackup(), checkInputRules);
    expect(await meta(sql)).toEqual(["sample_seeded"]);
  });
});

describe("loadSample (ADR 0112)", () => {
  /** A first-run database whose sample was cleared, with the banner dismissed before. */
  async function cleared(): Promise<TestSql> {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    await dismissSampleBanner(sql);
    await clearSample(sql, NOW);
    return sql;
  }

  it("loads the same records as the first-run seed and marks the sample active", async () => {
    const fresh = openMemorySql();
    await migrate(fresh);
    await seedIfEmpty(fresh);
    const sql = await cleared();

    await loadSample(sql);

    expect(await loadPortfolio(sql)).toEqual(await loadPortfolio(fresh));
    expect(await meta(sql)).toEqual(["sample_active", "sample_seeded"]);
    expect((await loadState(sql)).sample).toEqual({
      active: true,
      dismissed: false,
    });
  });

  it("shows the banner again after the sample was deleted by hand", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    await dismissSampleBanner(sql);
    // Deleted by hand: both markers stay behind.
    await sql.execute("DELETE FROM properties");

    await loadSample(sql);

    expect((await loadState(sql)).sample).toEqual({
      active: true,
      dismissed: false,
    });
  });

  it("keeps the user's assumptions", async () => {
    const sql = await cleared();
    const own = {
      ...(await loadAssumptions(sql)),
      appreciationPa: rate("0.02"),
      horizonYears: 20,
    };
    await upsertAssumptions(sql, own);

    await loadSample(sql);

    expect(await loadAssumptions(sql)).toEqual(own);
  });

  it("refuses when the portfolio has any property and writes nothing", async () => {
    const sql = await withOwnData();
    await clearSample(sql, NOW);

    await expect(loadSample(sql)).rejects.toBeInstanceOf(SampleNotEmptyError);

    expect(await ids(sql, "properties")).toEqual(["mine"]);
    expect(await meta(sql)).toEqual(["sample_seeded"]);
  });

  it("a failure in the load transaction leaves nothing behind", async () => {
    const sql = await cleared();
    await expect(
      loadSample(failOn(sql, /INSERT INTO leases/)),
    ).rejects.toThrow();
    expect(await ids(sql, "properties")).toEqual([]);
    expect(await meta(sql)).toEqual(["sample_seeded"]);
  });
});
