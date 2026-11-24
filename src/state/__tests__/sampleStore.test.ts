// ADR 0094: the store exposes the sample state, remembers "Keep exploring" across a
// relaunch, and clears the sample as a whole-database action that reloads afterwards.
// ADR 0112: loading it again on demand is a data write that reloads too.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import type { Sql } from "../../data/sql";
import { invoke } from "@tauri-apps/api/core";
import { unwrap } from "../../__tests__/support/result";

const disk = { fail: false };
vi.mocked(invoke).mockImplementation(() =>
  disk.fail ? Promise.reject("No space left on device") : Promise.resolve(),
);

function reset(): void {
  portfolioDb.set(null);
  usePortfolioStore.setState({
    portfolio: null,
    assumptions: null,
    sample: { active: false, dismissed: false },
    status: { kind: "idle" },
    error: null,
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
    // A banner from an earlier failed edit describes data that is gone (#136).
    usePortfolioStore.setState({ error: { kind: "other", message: "old" } });
    const { safetyBackup } = unwrap(
      await usePortfolioStore.getState().clearSample(),
    );
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
    ).resolves.toMatchObject({ ok: false, error: { kind: "safetyBackup" } });
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
    unwrap(await usePortfolioStore.getState().clearSample());
    // Pretend a backup was exported after the clear.
    await db.execute("DELETE FROM app_meta WHERE key = 'changed_since_backup'");

    usePortfolioStore.setState({ error: { kind: "other", message: "old" } });
    unwrap(await usePortfolioStore.getState().loadSample());

    const s = usePortfolioStore.getState();
    expect(s.portfolio!.properties).toHaveLength(3);
    expect(s.sample).toEqual({ active: true, dismissed: false });
    expect(s.backup.changedSince).toBe(true);
    expect(s.error).toBeNull();
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
    ).resolves.toMatchObject({ ok: false, error: { kind: "sampleNotEmpty" } });
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(3);
  });
});
