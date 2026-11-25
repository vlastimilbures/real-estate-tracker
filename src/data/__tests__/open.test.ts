// The app's database opener (src/data/open.ts, #465): it opens the Tauri SQLite inside
// the app, and in the DEV + VITE_E2E browser run the in-memory sql.js database; either way
// the database is migrated and seeded before the store reads it. Both adapters are
// replaced by the in-memory test database here.
import { afterEach, describe, expect, it, vi } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { DataError } from "../errors";

const adapters = vi.hoisted(() => ({
  inTauri: false,
  tauri: vi.fn(),
  browser: vi.fn(),
}));
vi.mock("../../lib/tauri", () => ({ isTauri: () => adapters.inTauri }));
vi.mock("../tauriSql", () => ({ openTauriSql: adapters.tauri }));
vi.mock("../../e2e/browserSql", () => ({ openBrowserSql: adapters.browser }));

const { defaultOpen } = await import("../open");

let sql: TestSql | undefined;
afterEach(() => {
  sql?.db.close();
  sql = undefined;
  adapters.inTauri = false;
  adapters.tauri.mockReset();
  adapters.browser.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const propertyCount = async (db: TestSql) =>
  (await db.select("SELECT id FROM properties")).length;

describe("defaultOpen (#465)", () => {
  it("opens the Tauri database, migrated and seeded", async () => {
    adapters.inTauri = true;
    vi.stubEnv("VITE_E2E", "1");
    sql = openMemorySql();
    adapters.tauri.mockResolvedValue(sql);

    expect(await defaultOpen()).toBe(sql);
    expect(adapters.browser).not.toHaveBeenCalled();
    expect(await propertyCount(sql)).toBe(3);
  });

  it("outside Tauri without VITE_E2E it still opens the Tauri adapter", async () => {
    sql = openMemorySql();
    adapters.tauri.mockResolvedValue(sql);

    expect(await defaultOpen()).toBe(sql);
    expect(adapters.browser).not.toHaveBeenCalled();
  });

  it("the DEV + VITE_E2E browser run opens the in-memory database, migrated and seeded", async () => {
    vi.stubEnv("VITE_E2E", "1");
    sql = openMemorySql();
    adapters.browser.mockResolvedValue(sql);

    expect(await defaultOpen()).toBe(sql);
    expect(adapters.tauri).not.toHaveBeenCalled();
    expect(await propertyCount(sql)).toBe(3);
  });

  it("the browser run applies a forced startup failure (ADR 0153)", async () => {
    vi.stubEnv("VITE_E2E", "1");
    vi.stubGlobal("sessionStorage", { getItem: () => "DB_NEWER" });
    sql = openMemorySql();
    adapters.browser.mockResolvedValue(sql);

    const e: unknown = await defaultOpen().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DataError);
    expect((e as DataError).code).toBe("DB_NEWER");
  });
});
