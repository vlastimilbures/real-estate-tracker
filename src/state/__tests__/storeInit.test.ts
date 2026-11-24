// The portfolio store's startup (init) and reload (refresh), and a relaunch over an
// emptied portfolio (DR-024).
import { describe, expect, it } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import type { Sql } from "../../data/sql";
import { DataError } from "../../data/errors";
import { openSeeded, text } from "./support/openSeeded";
import {
  errorOf,
  startupErrorOf,
  statusOf,
} from "../../__tests__/support/status";

describe("portfolioStore init & refresh", () => {
  it("a typed data-layer failure at startup is kept for the translated error screen", async () => {
    const details = ['properties "A", "A": duplicate name'];
    await usePortfolioStore
      .getState()
      .init(() =>
        Promise.reject(
          new DataError("MIGRATION_CONFLICT", "upgrade stopped", details),
        ),
      );
    const s = usePortfolioStore.getState();
    expect(statusOf(s)).toBe("error");
    expect(errorOf(s)).toEqual({
      kind: "data",
      code: "MIGRATION_CONFLICT",
      details,
    });
    expect(startupErrorOf(s)).toEqual({ code: "MIGRATION_CONFLICT", details });
  });

  it("a stopped upgrade keeps how far it got for the screen (#115)", async () => {
    const upgrade = {
      from: 6,
      reached: 7,
      stoppedAt: 8,
      backupPath: "/a/backups/pre-migration-v6-to-v10.sqlite",
    };
    await usePortfolioStore.getState().init(() =>
      Promise.reject(
        new DataError("MIGRATION_CONFLICT", "upgrade stopped", ["x"], {
          upgrade,
        }),
      ),
    );
    expect(startupErrorOf(usePortfolioStore.getState())).toEqual({
      code: "MIGRATION_CONFLICT",
      details: ["x"],
      upgrade,
    });
  });

  it("any other startup failure keeps the raw message only", async () => {
    await usePortfolioStore
      .getState()
      .init(() => Promise.reject(new Error("boom")));
    expect(startupErrorOf(usePortfolioStore.getState())).toBeNull();
    expect(errorOf(usePortfolioStore.getState())).toEqual({
      kind: "other",
      message: "boom",
    });
  });

  it("init() loads the portfolio + assumptions and goes ready", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const s = usePortfolioStore.getState();
    expect(statusOf(s)).toBe("ready");
    expect(s.portfolio!.properties.length).toBe(3);
    expect(s.assumptions).not.toBeNull();
  });

  it("init() is a no-op once ready (does not reopen the DB)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const sql = portfolioDb.get();
    let reopened = false;
    await usePortfolioStore.getState().init(async () => {
      reopened = true;
      return openSeeded();
    });
    expect(reopened).toBe(false);
    expect(portfolioDb.get()).toBe(sql);
  });

  it("init() surfaces an opener failure as status='error'", async () => {
    await usePortfolioStore
      .getState()
      .init(() => Promise.reject(new Error("boom")));
    const s = usePortfolioStore.getState();
    expect(statusOf(s)).toBe("error");
    expect(text(errorOf(s))).toMatch(/boom/);
  });

  it("refresh() reflects a row written directly to the DB", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const sql = portfolioDb.get()!;
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const before = usePortfolioStore.getState().portfolio!.valuations.length;

    await sql.execute(
      "INSERT INTO valuations (id, property_id, valid_from, valid_to, market_value) VALUES (?, ?, ?, ?, ?)",
      ["val-direct", pid, "2029-01-01", null, "9000000"],
    );
    await usePortfolioStore.getState().refresh();

    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before + 1,
    );
  });
});

describe("portfolioStore — emptied portfolio stays empty on relaunch (DR-024)", () => {
  it("removing every property, then relaunching, does not bring the sample back", async () => {
    const db = openMemorySql();
    const launch = async (): Promise<Sql> => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    };
    await usePortfolioStore.getState().init(launch);
    for (const p of usePortfolioStore.getState().portfolio!.properties) {
      const r = await usePortfolioStore.getState().removeProperty(p.id);
      expect(r.ok).toBe(true);
    }
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(0);

    // Relaunch: a fresh store over the same DB, via the app's open recipe.
    portfolioDb.set(null);
    usePortfolioStore.setState({
      portfolio: null,
      assumptions: null,
      status: { kind: "idle" },
      error: null,
    });
    await usePortfolioStore.getState().init(launch);
    expect(statusOf(usePortfolioStore.getState())).toBe("ready");
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(0);
  });
});
