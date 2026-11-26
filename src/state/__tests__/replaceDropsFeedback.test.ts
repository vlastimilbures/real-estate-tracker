// ADR 0154: replacing the data drops what described the old data — the UI's notice, its
// failure and the last import report. The store's replacing actions do it themselves
// when they succeed (#468); a failed one leaves them, since the data is as it was.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { useUiStore } from "../uiStore";
import { toActionError } from "../actionError";
import type { CsvImportReport } from "../csv";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";
import type { Sql } from "../../data/sql";
import { invoke } from "@tauri-apps/api/core";

vi.mocked(invoke).mockResolvedValue(undefined);

const store = () => usePortfolioStore.getState();
const ui = () => useUiStore.getState();

/** Start the store on a migrated database, seeded with the sample or empty. */
async function start(seeded: boolean): Promise<Sql> {
  const db = openMemorySql();
  await migrate(db);
  if (seeded) await seedIfEmpty(db);
  portfolioDb.set(null);
  usePortfolioStore.setState({ status: { kind: "idle" }, error: null });
  await store().init(async () => db);
  return db;
}

/** What the old data left: a notice, a failure and an import report. */
function leftovers() {
  useUiStore.setState({
    notice: { kind: "restored", file: "old-safety.json" },
    failure: { action: "import", error: toActionError(new Error("x")) },
    lastImport: { items: [] } as unknown as CsvImportReport,
  });
}

const dropped = () => ({
  notice: ui().notice,
  failure: ui().failure,
  lastImport: ui().lastImport,
});
const NONE = { notice: null, failure: null, lastImport: null };

beforeEach(() => {
  useUiStore.setState({ notice: null, failure: null, lastImport: null });
});

describe("a replacing action drops the old data's feedback (ADR 0154)", () => {
  it("restore", async () => {
    const db = await start(true);
    const file = await exportToJson(db, new Date());
    leftovers();
    expect((await store().restoreBackup(file)).ok).toBe(true);
    expect(dropped()).toEqual(NONE);
  });

  it("Clear sample", async () => {
    await start(true);
    leftovers();
    expect((await store().clearSample()).ok).toBe(true);
    expect(dropped()).toEqual(NONE);
  });

  it("Load sample", async () => {
    await start(false);
    leftovers();
    expect((await store().loadSample()).ok).toBe(true);
    expect(dropped()).toEqual(NONE);
  });

  it("a failed restore leaves them", async () => {
    await start(true);
    leftovers();
    expect((await store().restoreBackup({} as never)).ok).toBe(false);
    expect(ui().notice).toEqual({ kind: "restored", file: "old-safety.json" });
    expect(ui().failure).not.toBeNull();
    expect(ui().lastImport).not.toBeNull();
  });
});
