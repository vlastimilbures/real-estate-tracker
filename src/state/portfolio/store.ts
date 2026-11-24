// The portfolio store, built from its parts (#465): the state, the lifecycle actions and
// the action modules, sharing one write runner. Its opener and clock are injected.
import { create } from "zustand";
import type { Sql } from "../../data/sql";
import { DataError } from "../../data/errors";
import { logFailure } from "../../data/errorLog";
import { loadState } from "../../data/repositories";
import { toWriteError } from "../writeError";
import { createWriteRunner } from "./writeRunner";
import {
  blockActions,
  holdingCostActions,
  leaseActions,
  valuationActions,
} from "./entityActions";
import { propertyActions } from "./propertyActions";
import { scenarioActions } from "./scenarioActions";
import { wholeDbActions } from "./wholeDb";
import type { PortfolioState, StoreCtx } from "./types";

/** What a store needs from outside: the database opener `init` uses by default, and the
 *  clock that stamps scenarios and backups. */
export interface StoreDeps {
  open: () => Promise<Sql>;
  now: () => Date;
}

/** Startup and reading the data back, and the banner error. */
function lifecycleActions(
  { set, get, enqueue }: StoreCtx,
  deps: StoreDeps,
): Pick<PortfolioState, "init" | "refresh" | "clearError" | "showError"> {
  return {
    async init(open = deps.open) {
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
  };
}

/** A portfolio store: one write runner, shared by every action module. */
export function createPortfolioStore(deps: StoreDeps) {
  return create<PortfolioState>((set, get) => {
    const ctx: StoreCtx = {
      set,
      get,
      ...createWriteRunner(set, get),
      now: deps.now,
    };

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

      ...lifecycleActions(ctx, deps),

      ...valuationActions(ctx),
      ...leaseActions(ctx),
      ...blockActions(ctx),
      ...holdingCostActions(ctx),

      ...propertyActions(ctx),
      ...scenarioActions(ctx),

      ...wholeDbActions(ctx),
    };
  });
}
