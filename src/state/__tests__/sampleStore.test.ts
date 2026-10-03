// ADR 0094: the store exposes the sample state, remembers "Keep exploring" across a
// relaunch, and clears the sample as a whole-database action that reloads afterwards.
// ADR 0112: loading it again on demand is a data write that reloads too.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { SafetyBackupError, SampleNotEmptyError } from "../backup";
import type { Sql } from "../../data/sql";

const disk = vi.hoisted(() => ({ fail: false }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((_command: string, args: { json: string }) =>
    disk.fail
      ? Promise.reject("No space left on device")
      : Promise.resolve(args.json),
  ),
}));

function reset(): void {
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    assumptions: null,
    sample: { active: false, dismissed: false },
    status: "idle",
    error: null,
    startupError: null,
  });
}

beforeEach(() => {
  disk.fail = false;
  reset();
});

describe("portfolioStore sample (ADR 0094)", () => {
  it("a first run loads the sample as active", async () => {
    const db = openMemorySql();
    await usePortfolioStore.getState().init(async () => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    });
    expect(usePortfolioStore.getState().sample).toEqual({
      active: true,
      dismissed: false,
    });
  });

  it("dismissing the banner survives a relaunch", async () => {
    const db = openMemorySql();
    const launch = async (): Promise<Sql> => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    };
    await usePortfolioStore.getState().init(launch);
    const r = await usePortfolioStore.getState().dismissSampleBanner();
    expect(r.ok).toBe(true);
    expect(usePortfolioStore.getState().sample.dismissed).toBe(true);

    reset();
    await usePortfolioStore.getState().init(launch);
    expect(usePortfolioStore.getState().sample).toEqual({
      active: true,
      dismissed: true,
    });
  });

  it("clearSample removes the sample and reloads", async () => {
    const db = openMemorySql();
    await usePortfolioStore.getState().init(async () => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    });
    const { safetyBackup } = await usePortfolioStore.getState().clearSample();
    expect(safetyBackup).toMatch(
      /^portfolio-before-clear-sample-\d{8}T\d{6}Z\.json$/,
    );
    const s = usePortfolioStore.getState();
    expect(s.portfolio!.properties).toHaveLength(0);
    expect(s.sample).toEqual({ active: false, dismissed: false });
    expect(s.error).toBeNull();
  });

  it("clearSample throws the safety-backup failure and keeps the sample", async () => {
    const db = openMemorySql();
    await usePortfolioStore.getState().init(async () => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    });
    disk.fail = true;
    await expect(
      usePortfolioStore.getState().clearSample(),
    ).rejects.toBeInstanceOf(SafetyBackupError);
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(3);
    expect(usePortfolioStore.getState().sample.active).toBe(true);
  });

  it("loadSample loads the sample into an empty portfolio, reloads and marks a change (ADR 0112)", async () => {
    const db = openMemorySql();
    await usePortfolioStore.getState().init(async () => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    });
    await usePortfolioStore.getState().clearSample();
    // Pretend a backup was exported after the clear.
    await db.execute("DELETE FROM app_meta WHERE key = 'changed_since_backup'");

    await usePortfolioStore.getState().loadSample();

    const s = usePortfolioStore.getState();
    expect(s.portfolio!.properties).toHaveLength(3);
    expect(s.sample).toEqual({ active: true, dismissed: false });
    expect(s.backup.changedSince).toBe(true);
  });

  it("loadSample throws the refusal when the portfolio is not empty", async () => {
    const db = openMemorySql();
    await usePortfolioStore.getState().init(async () => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    });
    await expect(
      usePortfolioStore.getState().loadSample(),
    ).rejects.toBeInstanceOf(SampleNotEmptyError);
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(3);
  });
});
