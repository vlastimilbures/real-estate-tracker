// Failure-path tests for the portfolio store: a failed DB write must surface (set
// `error`, return `{ ok: false }`) rather than throw into the void, and must leave the
// in-memory state reconciled with what's actually on disk. The store is driven directly
// via getState() (zustand works outside React), so no DOM is needed.
import { describe, expect, it } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import type { IsoDate } from "../../engine";
import type { Sql } from "../../data/sql";
import { CHANGED_SINCE_BACKUP } from "../../data/repositories";
import { money } from "../../engine";
import { openSeeded, text } from "./support/openSeeded";
import { statusOf } from "../../__tests__/support/status";

describe("portfolioStore mutations", () => {
  it("returns an error result (not a throw) when the database is not initialised", async () => {
    const result = await usePortfolioStore
      .getState()
      .removeValuation("anything");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(text(result.error)).toMatch(/not initialised/i);
    expect(text(usePortfolioStore.getState().error)).toMatch(
      /not initialised/i,
    );
  });

  it("a successful mutation clears error and refreshes state", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    expect(statusOf(usePortfolioStore.getState())).toBe("ready");

    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const before = usePortfolioStore.getState().portfolio!.valuations.length;

    const result = await usePortfolioStore.getState().addValuation({
      id: "val-test",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2027, 0, 1)) as IsoDate,
      marketValue: money("13000000"),
    });

    expect(result.ok).toBe(true);
    expect(usePortfolioStore.getState().error).toBeNull();
    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before + 1,
    );
  });

  it("surfaces a failed write and reconciles state instead of throwing", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const real = portfolioDb.get()!;

    // A fake Sql whose writes reject but whose reads still work, so refresh() can
    // reconcile in-memory state back to what's actually persisted.
    const failing: Sql = {
      execute: () => Promise.reject(new Error("disk is full")),
      select: real.select.bind(real),
      selectSnapshot: real.selectSnapshot.bind(real),
      transaction: () => Promise.reject(new Error("disk is full")),
      backup: real.backup.bind(real),
    };
    portfolioDb.set(failing);

    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const before = usePortfolioStore.getState().portfolio!.valuations.length;

    const result = await usePortfolioStore.getState().addValuation({
      id: "val-fail",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2028, 0, 1)) as IsoDate,
      marketValue: money("1"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(text(result.error)).toMatch(/disk is full/i);
    expect(text(usePortfolioStore.getState().error)).toMatch(/disk is full/i);
    // status stays "ready" (mutation failures are not full-screen init errors) and the
    // optimistic row never sticks because refresh() reconciles to disk.
    expect(statusOf(usePortfolioStore.getState())).toBe("ready");
    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before,
    );
  });

  it("runs mutations one at a time, in call order (DR-085)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const real = portfolioDb.get()!;
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // The first write blocks until released; a second mutation must not start before.
    const slow: Sql = {
      ...real,
      select: real.select.bind(real),
      backup: real.backup.bind(real),
      transaction: real.transaction.bind(real),
      execute: async (q, p) => {
        log.push(`start ${String(p?.[0])}`);
        if (p?.[0] === "first") await gate;
        const r = await real.execute(q, p);
        log.push(`end ${String(p?.[0])}`);
        return r;
      },
    };
    portfolioDb.set(slow);
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const add = (id: string, y: number) =>
      usePortfolioStore.getState().addValuation({
        id,
        propertyId: pid,
        validFrom: new Date(Date.UTC(y, 0, 1)) as IsoDate,
        marketValue: money("1"),
      });
    const a = add("first", 2031);
    const b = add("second", 2032);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["start first"]);
    release();
    expect((await a).ok).toBe(true);
    expect((await b).ok).toBe(true);
    // Each write is followed by its "changed since backup" mark (ADR 0110).
    expect(log).toEqual([
      "start first",
      "end first",
      `start ${CHANGED_SINCE_BACKUP}`,
      `end ${CHANGED_SINCE_BACKUP}`,
      "start second",
      "end second",
      `start ${CHANGED_SINCE_BACKUP}`,
      `end ${CHANGED_SINCE_BACKUP}`,
    ]);
  });

  it("clearError() resets a surfaced error", async () => {
    await usePortfolioStore.getState().removeLease("missing");
    expect(usePortfolioStore.getState().error).not.toBeNull();
    usePortfolioStore.getState().clearError();
    expect(usePortfolioStore.getState().error).toBeNull();
  });
});
