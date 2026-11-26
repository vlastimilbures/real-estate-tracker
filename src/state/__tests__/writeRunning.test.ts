// ADR 0253 (#444): the store counts the writes queued or running in `writesRunning`, from
// the call until the write settles, so row write actions can be disabled meanwhile. The
// count is back to 0 before the caller's `await` resumes (ADR 0248's focus restore needs
// the button enabled by then). Reads do not count.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";
import { parseProperties } from "../../import/csv";
import type { Sql } from "../../data/sql";
import { money, type IsoDate } from "../../engine";
import { unwrap } from "../../__tests__/support/result";

vi.mocked(invoke).mockResolvedValue(undefined);

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
const running = () => store().writesRunning;
/** A dated valuation `id` on the first property: one insert, no other row changed
 *  (ADR 0144). */
const valuation = (id: string) => ({
  id,
  propertyId: store().portfolio!.properties[0]!.id,
  validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
  validTo: new Date(Date.UTC(2033, 11, 31)) as IsoDate,
  marketValue: money("1"),
});

/** `db`, but every `execute` waits until `release()`. */
function held() {
  let release!: () => void;
  const opened = new Promise<void>((r) => (release = r));
  const sql: Sql = {
    ...db,
    execute: async (q, p) => {
      await opened;
      return db.execute(q, p);
    },
  };
  portfolioDb.set(sql);
  return release;
}

describe("writesRunning (ADR 0253)", () => {
  it("starts at 0", () => {
    expect(running()).toBe(0);
  });

  it("rises at the call, before the write has started", async () => {
    const release = held();
    const write = store().addValuation(valuation("v1"));
    expect(running()).toBe(1);
    release();
    await write;
    expect(running()).toBe(0);
  });

  it("stays up across two queued writes, counting the one that waits", async () => {
    const release = held();
    const first = store().addValuation(valuation("v1"));
    const second = store().addValuation(valuation("v2"));
    expect(running()).toBe(2);
    let afterFirst = -1;
    const firstDone = first.then(() => (afterFirst = running()));
    release();
    await firstDone;
    expect(afterFirst).toBe(1);
    await second;
    expect(running()).toBe(0);
  });

  it("drops after a failed write", async () => {
    portfolioDb.set({
      ...db,
      execute: () => Promise.reject(new Error("disk I/O")),
    });
    const result = await store().addValuation(valuation("v1"));
    expect(result.ok).toBe(false);
    expect(running()).toBe(0);
  });

  it("drops after a write that throws (exclusive, replaceData)", async () => {
    // The sample is loaded: Load sample refuses a non-empty portfolio.
    await expect(store().loadSample()).resolves.toMatchObject({ ok: false });
    expect(running()).toBe(0);
  });

  it("is 0 when the caller's await resumes", async () => {
    // Read synchronously at the resume: a count dropped later would still show here.
    const result = await store().addValuation(valuation("v1"));
    const afterWrite = running();
    unwrap(await store().clearSample());
    const afterReplace = running();
    expect(result.ok).toBe(true);
    expect([afterWrite, afterReplace]).toEqual([0, 0]);
  });

  it("a CSV preview, a read, does not raise it", async () => {
    const batch = {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nPreviewed,2020-01-01,1",
      ).rows,
    };
    const preview = store().previewCsv(batch);
    expect(running()).toBe(0);
    await preview;
    expect(running()).toBe(0);
  });

  it("a CSV import counts once", async () => {
    const batch = {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nImported,2020-01-01,1",
      ).rows,
    };
    unwrap(await store().previewCsv(batch));
    const write = store().importCsv(batch);
    expect(running()).toBe(1);
    await write;
    expect(running()).toBe(0);
  });

  it("a restore raises it once, from the call until it settles", async () => {
    const file = await exportToJson(db, new Date());
    const restore = store().restoreBackup(file);
    expect(running()).toBe(1);
    expect(store().replacing).toBe(1);
    await restore;
    expect(running()).toBe(0);
    expect(store().replacing).toBe(0);
  });
});
