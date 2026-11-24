// ADR 0147 (#467 review L4): the whole-database actions log a failure once, at the
// store, under their site, and never log a refusal the user can fix: a refused restore
// or a refused import plan.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { logFailure } from "../../data/errorLog";
import { exportToJson } from "../../data/backup";
import type { Sql } from "../../data/sql";
import { parseProperties, parseRents } from "../../import/csv";
import { openSeeded } from "./support/openSeeded";

vi.mocked(invoke).mockResolvedValue(undefined);

const store = () => usePortfolioStore.getState();
const logged = () => vi.mocked(logFailure).mock.calls.map(([site]) => site);
const fail = () => Promise.reject(new Error("disk I/O error"));

const newProperty = {
  properties: parseProperties(
    "name,purchase_date,purchase_price\nLogged Import,2020-01-01,1000000",
  ).rows,
};

let sql: Sql;

beforeEach(async () => {
  sql = await openSeeded();
  await store().init(async () => sql);
  vi.mocked(logFailure).mockClear();
});

describe("whole-database failures are logged once (ADR 0147)", () => {
  it("a failed preview logs IMPORT once", async () => {
    portfolioDb.set({ ...sql, select: fail, selectSnapshot: fail });
    expect((await store().previewCsv(newProperty)).ok).toBe(false);
    expect(logged()).toEqual(["IMPORT"]);
  });

  it("a failed import logs IMPORT once", async () => {
    portfolioDb.set({
      ...sql,
      select: sql.select.bind(sql),
      selectSnapshot: sql.selectSnapshot.bind(sql),
      execute: fail,
      transaction: fail,
    });
    expect((await store().importCsv(newProperty)).ok).toBe(false);
    expect(logged()).toEqual(["IMPORT"]);
  });

  it("a failed backup export logs BACKUP once", async () => {
    portfolioDb.set({ ...sql, select: fail, selectSnapshot: fail });
    expect((await store().exportBackup()).ok).toBe(false);
    expect(logged()).toEqual(["BACKUP"]);
  });
});

describe("a refusal is not logged (ADR 0147)", () => {
  it("a refused restore", async () => {
    const file = await exportToJson(sql, new Date());
    const leases = file.tables.leases!;
    leases[0] = { ...leases[0], monthly_rent: "abc" };
    await expect(store().restoreBackup(file)).resolves.toMatchObject({
      ok: false,
      error: { kind: "restoreRefused" },
    });
    expect(logged()).toEqual([]);
  });

  it("a refused import plan", async () => {
    const refused = {
      rents: parseRents(
        "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
      ).rows,
    };
    await expect(store().importCsv(refused)).resolves.toMatchObject({
      ok: false,
      error: { kind: "planRefused" },
    });
    expect(logged()).toEqual([]);
  });
});
