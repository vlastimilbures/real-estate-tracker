// Portfolio state: the engine INPUTS (portfolio + assumptions), loaded from SQLite and
// written through on every edit. This is the one-way data flow's source: DB → store →
// (useEngine) → UI. No finance maths here — edits persist, then in-memory state refreshes
// so the memoized engine recomputes (CLAUDE.md §4).
import { create } from "zustand";
import { defaultOpen } from "../data/open";
import { DataError } from "../data/errors";
import { toWriteError } from "./writeError";
import { logFailure } from "../data/errorLog";
import { loadState } from "../data/repositories";
import { createWriteRunner } from "./portfolio/writeRunner";
import type { PortfolioState, StoreCtx } from "./portfolio/types";
import {
  blockActions,
  holdingCostActions,
  leaseActions,
  valuationActions,
} from "./portfolio/entityActions";
import { propertyActions } from "./portfolio/propertyActions";
import { scenarioActions } from "./portfolio/scenarioActions";
import { wholeDbActions } from "./portfolio/wholeDb";
export type {
  MutationResult,
  PropertyExtras,
  StartupError,
} from "./portfolio/types";

export const usePortfolioStore = create<PortfolioState>((set, get) => {
  const runner = createWriteRunner(set, get);
  const { enqueue } = runner;
  const ctx: StoreCtx = { set, get, ...runner };

  return {
    sql: null,
    portfolio: null,
    assumptions: null,
    scenarios: [],
    sample: { active: false, dismissed: false },
    backup: { lastAt: null, lastFile: null, changedSince: false },
    status: "idle",
    error: null,
    startupError: null,
    readBackFailed: false,
    refusedWrites: [],
    replacing: 0,
    writesRunning: 0,

    async init(open = defaultOpen) {
      if (get().status === "loading" || get().status === "ready") return;
      set({ status: "loading", error: null, startupError: null });
      // Try again after a failed read-back only reads, behind any queued job: the
      // database is open and at head, so nothing is migrated or seeded (ADR 0228).
      if (get().readBackFailed) {
        try {
          await enqueue(() => get().refresh());
          set({ status: "ready", readBackFailed: false, refusedWrites: [] });
        } catch (e) {
          logFailure("RELOAD", e);
          set({ status: "error" });
        }
        return;
      }
      try {
        const sql = await open();
        set({ sql });
        await get().refresh();
        set({ status: "ready" });
      } catch (e) {
        logFailure("STARTUP", e);
        set({
          status: "error",
          error: toWriteError(e),
          startupError:
            e instanceof DataError
              ? {
                  code: e.code,
                  details: e.details,
                  ...(e.upgrade && { upgrade: e.upgrade }),
                }
              : null,
        });
      }
    },

    async refresh() {
      const sql = get().sql;
      if (!sql) return;
      // One point-in-time snapshot of every table (DR-134).
      const state = await loadState(sql);
      set(state);
    },

    clearError: () => set({ error: null }),
    showError: (error) => set({ error }),

    ...valuationActions(ctx),
    ...leaseActions(ctx),
    ...blockActions(ctx),
    ...holdingCostActions(ctx),

    ...propertyActions(ctx),
    ...scenarioActions(ctx),

    ...wholeDbActions(ctx),
  };
});

/** A write is queued or running: row write actions are disabled (ADR 0253). */
export const useWriteRunning = (): boolean =>
  usePortfolioStore((s) => s.writesRunning > 0);
