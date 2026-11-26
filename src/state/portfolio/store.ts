// The portfolio store, built from its parts: the state, the lifecycle actions and the
// action modules, sharing one write runner. Its opener and clock are injected.
import { create } from "zustand";
import type { Sql } from "../../data/sql";
import { DataError } from "../../data/errors";
import { logFailure } from "../../data/errorLog";
import { loadState } from "../../data/loadState";
import { toWriteError } from "../writeError";
import { createWriteRunner } from "./writeRunner";
import { refusedOf, writesRefused } from "./status";
import {
  blockActions,
  holdingCostActions,
  leaseActions,
  valuationActions,
} from "./entityActions";
import { propertyActions } from "./propertyActions";
import { scenarioActions } from "./scenarioActions";
import { wholeDbActions } from "./wholeDb";
import type {
  DbHandle,
  PortfolioState,
  ReplacedNotice,
  StoreCtx,
} from "./types";

/** What a store needs from outside: the database opener `init` uses by default, the
 *  clock that stamps scenarios and backups, and what to drop once the data is replaced
 *  (the UI's notice, failure and import report, ADR 0154). */
export interface StoreDeps {
  open: () => Promise<Sql>;
  now: () => Date;
  dataReplaced: (safetyCopy?: ReplacedNotice) => void;
}

/** Startup and reading the data back, and the banner error. */
function lifecycleActions(
  { set, get, db, enqueue }: StoreCtx,
  deps: StoreDeps,
): Pick<PortfolioState, "init" | "refresh" | "clearError" | "showError"> {
  return {
    async init(open = deps.open) {
      const { status } = get();
      if (status.kind === "loading" || status.kind === "ready") return;
      // Try again after a failed read-back only reads, behind any queued job: the
      // database is open and at head, so nothing is migrated or seeded (ADR 0228).
      // Writes stay refused until it has read the data.
      if (writesRefused(status)) {
        set({
          status: { kind: "loading", refused: status.refused },
          error: null,
        });
        try {
          await enqueue(() => get().refresh());
          set({ status: { kind: "ready" } });
        } catch (e) {
          logFailure("RELOAD", e);
          set({
            status: {
              kind: "readBackFailed",
              refused: refusedOf(get().status),
            },
          });
        }
        return;
      }
      set({ status: { kind: "loading" }, error: null });
      try {
        db.set(await open());
        await get().refresh();
        set({ status: { kind: "ready" } });
      } catch (e) {
        logFailure("STARTUP", e);
        set({
          status: {
            kind: "startupFailed",
            error: toWriteError(e),
            startup:
              e instanceof DataError
                ? {
                    code: e.code,
                    details: e.details,
                    ...(e.upgrade && { upgrade: e.upgrade }),
                  }
                : null,
          },
        });
      }
    },

    async refresh() {
      const sql = db.get();
      if (!sql) return;
      // One point-in-time snapshot of every table.
      const state = await loadState(sql);
      set(state);
    },

    clearError: () => set({ error: null }),
    showError: (error) => set({ error }),
  };
}

/** A portfolio store: one write runner, shared by every action module. `db` is the
 *  store's open database, outside its state. */
export function createPortfolioStore(deps: StoreDeps) {
  let sql: Sql | null = null;
  const db: DbHandle = {
    get: () => sql,
    set: (next) => {
      sql = next;
    },
  };
  const store = create<PortfolioState>((set, get) => {
    const ctx: StoreCtx = {
      set,
      get,
      db,
      ...createWriteRunner(set, get, db),
      now: deps.now,
      dataReplaced: deps.dataReplaced,
    };

    return {
      portfolio: null,
      assumptions: null,
      scenarios: [],
      sample: { active: false, dismissed: false },
      backup: { lastAt: null, lastFile: null, changedSince: false },
      status: { kind: "idle" },
      error: null,
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
  return { store, db };
}
