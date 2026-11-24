// ADR 0255 (#446): a write queued behind a committed write whose read-back failed is
// refused (ADR 0228), and the store keeps what it would have changed, so the error screen
// can name it: once each, in the order refused, bookkeeping left out. A successful Try
// again empties the list.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { invoke } from "@tauri-apps/api/core";
import { exportToJson } from "../../data/backup";
import { parseProperties } from "../../import/csv";
import type { Sql } from "../../data/sql";
import { money, type IsoDate } from "../../engine";
import {
  readBackFailedOf,
  refusedWritesOf,
  statusOf,
} from "../../__tests__/support/status";

vi.mocked(invoke).mockResolvedValue(undefined);

/** `real`, but the reload's snapshot read fails: the write commits, the reload after it
 *  fails. A snapshot that reads `schema_migrations` (a safety backup) still passes. */
const reloadFails = (real: Sql): Sql => ({
  ...real,
  selectSnapshot: (statements) =>
    statements.some((s) => s.query.includes("schema_migrations"))
      ? real.selectSnapshot(statements)
      : Promise.reject(new Error("database is locked")),
});

let db: TestSql;

beforeEach(async () => {
  db = openMemorySql();
  await usePortfolioStore.getState().init(async () => {
    await migrate(db);
    await seedIfEmpty(db);
    return db;
  });
});

const store = () => usePortfolioStore.getState();
const valuation = (id: string) => ({
  id,
  propertyId: store().portfolio!.properties[0]!.id,
  validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
  marketValue: money("1"),
});
/** The first property's lease, saved unchanged. */
const lease = () => store().portfolio!.leases[0]!;

/** Save a valuation whose read-back fails, with `queued` called right behind it. */
async function behindAFailedReadBack(queued: () => Promise<unknown>[]) {
  portfolioDb.set(reloadFails(db));
  const first = store().addValuation(valuation("first"));
  const behind = queued();
  expect(await first).toEqual({ ok: true });
  const settled = await Promise.allSettled(behind);
  expect(readBackFailedOf(store())).toBe(true);
  return settled;
}

describe("refused writes are kept for the screen (ADR 0255)", () => {
  it("starts empty", () => {
    expect(refusedWritesOf(store())).toEqual([]);
  });

  it("keeps a lease saved right behind the valuation", async () => {
    await behindAFailedReadBack(() => [store().saveLease(lease())]);
    expect(refusedWritesOf(store())).toEqual(["leases"]);
  });

  it("keeps each table once, in the order refused", async () => {
    const assumptions = store().assumptions!;
    await behindAFailedReadBack(() => [
      store().saveLease(lease()),
      store().addValuation(valuation("second")),
      store().removeLease(lease().id),
      store().saveAssumptions(assumptions),
      store().removeScenario("none"),
      store().setPropertyActive(store().portfolio!.properties[0]!.id, false),
    ]);
    expect(refusedWritesOf(store())).toEqual([
      "leases",
      "valuations",
      "assumptions",
      "scenarios",
      "properties",
    ]);
  });

  it("names the table of every record write", async () => {
    const p = store().portfolio!;
    await behindAFailedReadBack(() => [
      store().saveMortgageBlock(p.mortgages[0]!),
      store().saveHoldingCost(p.holdingCosts[0]!),
    ]);
    expect(refusedWritesOf(store())).toEqual([
      "mortgage_blocks",
      "holding_costs",
    ]);
  });

  it("names the whole-database actions, which still throw", async () => {
    const file = await exportToJson(db, new Date());
    const settled = await behindAFailedReadBack(() => [
      store().importCsv({
        properties: parseProperties(
          "name,purchase_date,purchase_price\nRefused,2020-01-01,1000000",
        ).rows,
      }),
      store().restoreBackup(file),
      store().clearSample(),
      store().loadSample(),
    ]);
    expect(settled).toMatchObject([
      { value: { ok: false } },
      { value: { ok: false } },
      { value: { ok: false } },
      { value: { ok: false } },
    ]);
    expect(refusedWritesOf(store())).toEqual([
      "importCsv",
      "restore",
      "clearSample",
      "loadSample",
    ]);
  });

  it("leaves out bookkeeping: dismissing the sample banner", async () => {
    const [dismissed] = await behindAFailedReadBack(() => [
      store().dismissSampleBanner(),
    ]);
    expect(dismissed).toMatchObject({ value: { ok: false } });
    expect(refusedWritesOf(store())).toEqual([]);
  });

  it("a successful Try again empties the list", async () => {
    await behindAFailedReadBack(() => [store().saveLease(lease())]);
    portfolioDb.set(db);
    await store().init();
    expect(statusOf(store())).toBe("ready");
    expect(refusedWritesOf(store())).toEqual([]);
  });

  it("a Try again that fails again keeps the list", async () => {
    await behindAFailedReadBack(() => [store().saveLease(lease())]);
    await store().init();
    expect(statusOf(store())).toBe("error");
    expect(refusedWritesOf(store())).toEqual(["leases"]);
  });

  it("a write refused because no database is open is not kept", async () => {
    portfolioDb.set(null);
    expect((await store().saveLease(lease())).ok).toBe(false);
    expect(refusedWritesOf(store())).toEqual([]);
  });
});
