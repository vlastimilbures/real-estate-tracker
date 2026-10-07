// ADR 0110: a successful export records when and to which file; a cancelled or failed
// one records nothing. Every data write marks the data as changed since the backup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";
import { BackupExportError } from "../backup";
import { SaveFileError, type SaveOutcome } from "../../platform/saveFile";

const save = vi.hoisted(() => ({
  next: (): Promise<unknown> => Promise.resolve({ kind: "cancelled" }),
}));
vi.mock("../../platform/saveFile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveFile: vi.fn(() => save.next()),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((_command: string, args: { json: string }) =>
    Promise.resolve(args.json),
  ),
}));

let db: TestSql;

beforeEach(async () => {
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    assumptions: null,
    sample: { active: false, dismissed: false },
    backup: { lastAt: null, lastFile: null, changedSince: false },
    status: "idle",
    error: null,
    startupError: null,
  });
  db = openMemorySql();
  await usePortfolioStore.getState().init(async () => {
    await migrate(db);
    await seedIfEmpty(db);
    return db;
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-12T08:30:00.000Z"));
});

afterEach(() => vi.useRealTimers());

const outcome = (o: SaveOutcome) => {
  save.next = () => Promise.resolve(o);
};
const backup = () => usePortfolioStore.getState().backup;
const edit = async () => {
  const a = usePortfolioStore.getState().assumptions!;
  const r = await usePortfolioStore
    .getState()
    .saveAssumptions({ ...a, horizonYears: 25 });
  expect(r.ok).toBe(true);
};

describe("portfolioStore backup recency (ADR 0110)", () => {
  it("an edit marks the data as changed", async () => {
    expect(backup().changedSince).toBe(false);
    await edit();
    expect(backup().changedSince).toBe(true);
  });

  it("dismissing the sample banner is not a data change", async () => {
    await usePortfolioStore.getState().dismissSampleBanner();
    expect(backup().changedSince).toBe(false);
  });

  it("a saved export records the time and file and clears the flag", async () => {
    await edit();
    outcome({ kind: "saved", filename: "portfolio-backup-2026-09-12.json" });
    await usePortfolioStore.getState().exportBackup();
    expect(backup()).toEqual({
      lastAt: "2026-09-12T08:30:00.000Z",
      lastFile: "portfolio-backup-2026-09-12.json",
      changedSince: false,
    });
  });

  it("a downloaded export (browser build) counts too", async () => {
    outcome({ kind: "downloaded", filename: "portfolio-backup.json" });
    await usePortfolioStore.getState().exportBackup();
    expect(backup().lastFile).toBe("portfolio-backup.json");
  });

  it("a cancelled export records nothing", async () => {
    await edit();
    outcome({ kind: "cancelled" });
    const r = await usePortfolioStore.getState().exportBackup();
    expect(r.kind).toBe("cancelled");
    expect(backup()).toEqual({
      lastAt: null,
      lastFile: null,
      changedSince: true,
    });
  });

  it("a failed export records nothing", async () => {
    await edit();
    save.next = () => Promise.reject(new SaveFileError("disk full"));
    await expect(usePortfolioStore.getState().exportBackup()).rejects.toThrow(
      BackupExportError,
    );
    expect(backup()).toEqual({
      lastAt: null,
      lastFile: null,
      changedSince: true,
    });
  });

  it("an edit made while the save dialog is open keeps the data marked as changed", async () => {
    let finish!: (o: SaveOutcome) => void;
    save.next = () => new Promise((r) => (finish = r));
    const exporting = usePortfolioStore.getState().exportBackup();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await edit();
    finish({ kind: "saved", filename: "before-the-edit.json" });
    await exporting;
    // `vi.waitFor` moves the fake clock, so only the day of `lastAt` is fixed here.
    expect(backup()).toEqual({
      lastAt: expect.stringMatching(/^2026-09-12T/),
      lastFile: "before-the-edit.json",
      changedSince: true,
    });
  });

  it("a restore keeps the local last backup and marks the data as changed", async () => {
    const file = await exportToJson(db, new Date());
    outcome({ kind: "saved", filename: "local.json" });
    await usePortfolioStore.getState().exportBackup();
    await usePortfolioStore.getState().restoreBackup(file);
    expect(backup()).toEqual({
      lastAt: "2026-09-12T08:30:00.000Z",
      lastFile: "local.json",
      changedSince: true,
    });
  });
});
