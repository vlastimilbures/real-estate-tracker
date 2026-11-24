// Portfolio state: the engine INPUTS (portfolio + assumptions), loaded from SQLite and
// written through on every edit. This is the one-way data flow's source: DB → store →
// (useEngine) → UI. No finance maths here — edits persist, then in-memory state refreshes
// so the memoized engine recomputes (CLAUDE.md §4).
import { create } from "zustand";
import { defaultOpen } from "../data/open";
import { DataError, READ_FAILURES } from "../data/errors";
import { toWriteError } from "./writeError";
import { logFailure } from "../data/errorLog";
import { clearSample, loadSample } from "../data/seed";
import { confirmRestore, exportBackup } from "../data/backup";
import { checkInputRules } from "./restoreRules";
import { loadState, recordBackup } from "../data/repositories";
import { localIsoDay } from "../lib/day";
import { saveFile } from "../platform/saveFile";
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
export type {
  MutationResult,
  PropertyExtras,
  StartupError,
} from "./portfolio/types";

export const usePortfolioStore = create<PortfolioState>((set, get) => {
  const runner = createWriteRunner(set, get);
  const { enqueue, exclusive, replaceData, requireSql, writesSoFar } = runner;
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

    // Loaded on first use: keeps the CSV parser out of the startup bundle (P9).
    previewCsv: (batch) =>
      enqueue(async () => {
        const { previewImport } = await import("../import/csvImport");
        return previewImport(requireSql(), batch);
      }),
    importCsv: (batch) =>
      exclusive("importCsv", async (sql) => {
        const { importCsv } = await import("../import/csvImport");
        return importCsv(sql, batch);
      }),
    restoreBackup: (backup) =>
      replaceData("restore", (sql) =>
        confirmRestore(sql, backup, checkInputRules),
      ),
    restoreAtStartup: async (backup) => {
      // Only where the database migrated to head and only reading it failed
      // (READ_FAILURES, ADR 0231); any other startup failure leaves a database a
      // restore must not write to.
      const code = get().startupError?.code;
      if (get().status !== "error" || !code || !READ_FAILURES.has(code))
        throw new Error(
          "A restore at startup needs a ROW_INVALID or SCENARIO_INVALID failure",
        );
      const { safetyBackup } = await exclusive("restore", (sql) =>
        confirmRestore(sql, backup, checkInputRules),
      );
      return {
        safetyBackup,
        ready: get().portfolio !== null && !get().readBackFailed,
      };
    },
    continueAfterRestore: () => {
      const s = get();
      if (s.status !== "error" || s.portfolio === null || s.readBackFailed)
        return;
      set({ status: "ready", error: null, startupError: null });
    },
    clearSample: () => replaceData("clearSample", (sql) => clearSample(sql)),
    loadSample: () => replaceData("loadSample", loadSample),
    exportBackup: async () => {
      const writesBefore = writesSoFar();
      // One clock read names the file and stamps `exportedAt` (ADR 0149 §6).
      const now = new Date();
      const outcome = await exportBackup(requireSql(), {
        now,
        today: localIsoDay(now),
        save: saveFile,
      });
      if (outcome.kind !== "cancelled") {
        // The file is saved; failing to record it must not turn that into an error.
        // "Last backup" is the time the file was saved, after the dialog (ADR 0110).
        const at = new Date().toISOString();
        await exclusive(
          "bookkeeping",
          (sql) =>
            recordBackup(
              sql,
              at,
              outcome.filename,
              writesSoFar() === writesBefore,
            ),
          false,
        ).catch((e: unknown) => logFailure("BACKUP", e));
      }
      return outcome;
    },
  };
});

/** A write is queued or running: row write actions are disabled (ADR 0253). */
export const useWriteRunning = (): boolean =>
  usePortfolioStore((s) => s.writesRunning > 0);
