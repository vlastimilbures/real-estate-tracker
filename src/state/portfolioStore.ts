// Portfolio state: the engine INPUTS (portfolio + assumptions), loaded from SQLite and
// written through on every edit. This is the one-way data flow's source: DB → store →
// (useEngine) → UI. No finance maths here — edits persist, then in-memory state refreshes
// so the memoized engine recomputes (CLAUDE.md §4).
import { create } from "zustand";
import { dayBefore, openPredecessor } from "../engine";
import type { Portfolio, Scenario } from "../engine";
import { defaultOpen } from "../data/open";
import { DataError, READ_FAILURES } from "../data/errors";
import { toWriteError } from "./writeError";
import { logFailure } from "../data/errorLog";
import { clearSample, dismissSampleBanner, loadSample } from "../data/seed";
import { confirmRestore, exportBackup } from "../data/backup";
import { checkInputRules } from "./restoreRules";
import {
  loadState,
  upsertScenario,
  deleteScenario,
  insertValuation,
  insertValuationClosingPrevious,
  updateValuation,
  deleteValuation,
  insertLease,
  insertLeaseClosingPrevious,
  updateLease,
  deleteLease,
  insertMortgageBlock,
  updateMortgageBlock,
  deleteMortgageBlock,
  updateHoldingCost,
  insertPropertyWithCosts,
  deleteProperty,
  upsertAssumptions,
  updateProperty,
  setPropertyActive,
  getPropertyExtras,
  recordBackup,
} from "../data/repositories";
import {
  valuationToRow,
  leaseToRow,
  mortgageBlockToRow,
  holdingCostToRow,
  propertyToRow,
  scenarioToRow,
} from "../data/mappers";
import { localIsoDay } from "../lib/day";
import { saveFile } from "../platform/saveFile";
import { createWriteRunner } from "./portfolio/writeRunner";
import {
  checkAssumptions,
  checkEdit as checkStoredEdit,
  checkScenario,
  withRow,
} from "./portfolio/rules";
import type { PortfolioState } from "./portfolio/types";
export type {
  MutationResult,
  PropertyExtras,
  StartupError,
} from "./portfolio/types";

export const usePortfolioStore = create<PortfolioState>((set, get) => {
  const { enqueue, mutate, exclusive, replaceData, requireSql, writesSoFar } =
    createWriteRunner(set, get);

  /** checkEdit on the loaded portfolio: inside the queued op, it sees every earlier
   *  write. */
  const checkEdit = (
    edit: (p: Portfolio) => Portfolio,
    ids: string[],
    overlapIds?: string[],
  ) => checkStoredEdit(get().portfolio, edit, ids, overlapIds);

  /** Add or save `s`. An insert stamps created_at; an update keeps the stored one
   *  (ADR 0123). */
  const writeScenario = (s: Scenario) =>
    mutate("scenarios", async (sql) => {
      checkScenario(get(), s);
      await upsertScenario(sql, scenarioToRow(s, new Date()));
    });

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

    addValuation: (v) =>
      mutate("valuations", async (sql) => {
        checkEdit(
          (p) => ({ ...p, valuations: withRow(p.valuations, v) }),
          [v.id],
        );
        await insertValuation(sql, valuationToRow(v));
      }),
    addValuationClosingPrevious: (v, closedPrev) =>
      mutate("valuations", async (sql) => {
        checkEdit(
          (p) => ({
            ...p,
            valuations: withRow(withRow(p.valuations, closedPrev), v),
          }),
          [v.id, closedPrev.id],
        );
        await insertValuationClosingPrevious(sql, v, closedPrev);
      }),
    saveValuation: (v) =>
      mutate("valuations", async (sql) => {
        checkEdit(
          (p) => ({ ...p, valuations: withRow(p.valuations, v) }),
          [v.id],
        );
        await updateValuation(sql, v);
      }),
    removeValuation: (id) =>
      mutate("valuations", (sql) => deleteValuation(sql, id)),

    addLease: (l) =>
      mutate("leases", async (sql) => {
        const prev = openPredecessor(
          get().portfolio?.leases ?? [],
          l.propertyId,
          l.startDate,
          (x) => x.startDate,
          (x) => x.endDate,
        );
        if (!prev) {
          checkEdit((p) => ({ ...p, leases: withRow(p.leases, l) }), [l.id]);
          await insertLease(sql, leaseToRow(l));
          return;
        }
        const closedPrev = { ...prev, endDate: dayBefore(l.startDate) };
        // Ending the predecessor only shortens it: an overlap it already had with another
        // stored lease is not this add's to report (ADR 0163 §4).
        checkEdit(
          (p) => ({ ...p, leases: withRow(withRow(p.leases, closedPrev), l) }),
          [l.id, closedPrev.id],
          [l.id],
        );
        await insertLeaseClosingPrevious(sql, l, closedPrev);
      }),
    saveLease: (l) =>
      mutate("leases", async (sql) => {
        checkEdit((p) => ({ ...p, leases: withRow(p.leases, l) }), [l.id]);
        await updateLease(sql, l);
      }),
    removeLease: (id) => mutate("leases", (sql) => deleteLease(sql, id)),

    addMortgageBlock: (m) =>
      mutate("mortgage_blocks", async (sql) => {
        checkEdit(
          (p) => ({ ...p, mortgages: withRow(p.mortgages, m) }),
          [m.id],
        );
        await insertMortgageBlock(sql, mortgageBlockToRow(m));
      }),
    saveMortgageBlock: (m) =>
      mutate("mortgage_blocks", async (sql) => {
        checkEdit(
          (p) => ({ ...p, mortgages: withRow(p.mortgages, m) }),
          [m.id],
        );
        await updateMortgageBlock(sql, m);
      }),
    removeMortgageBlock: (id) =>
      mutate("mortgage_blocks", (sql) => deleteMortgageBlock(sql, id)),

    saveHoldingCost: (h) =>
      mutate("holding_costs", async (sql) => {
        checkEdit(
          (p) => ({ ...p, holdingCosts: withRow(p.holdingCosts, h) }),
          [h.id],
        );
        await updateHoldingCost(sql, h);
      }),

    addProperty: (p, cost, extra) =>
      mutate("properties", async (sql) => {
        checkEdit(
          (pf) => ({
            ...pf,
            properties: withRow(pf.properties, p),
            holdingCosts: withRow(pf.holdingCosts, cost),
          }),
          [p.id, cost.id],
        );
        await insertPropertyWithCosts(
          sql,
          propertyToRow(p, extra),
          holdingCostToRow(cost),
        );
      }),
    editProperty: (edited, extra) =>
      mutate("properties", async (sql) => {
        const stored = get().portfolio?.properties.find(
          (x) => x.id === edited.id,
        );
        // The form carries no flag: keep the stored. It always sends a funding record
        // (`{}` clears); one an edit leaves out is kept (ADR 0119 §8).
        const p = {
          ...edited,
          active: edited.active ?? stored?.active,
          funding: edited.funding ?? stored?.funding,
        };
        checkEdit(
          (pf) => ({ ...pf, properties: withRow(pf.properties, p) }),
          [p.id],
        );
        await updateProperty(sql, propertyToRow(p, extra));
      }),
    getPropertyExtras: async (id) => {
      const sql = get().sql;
      return sql ? getPropertyExtras(sql, id) : { address: null, garage: null };
    },
    setPropertyActive: (id, active) =>
      mutate("properties", (sql) => setPropertyActive(sql, id, active)),
    removeProperty: (id) =>
      mutate("properties", (sql) => deleteProperty(sql, id)),

    saveAssumptions: (a) =>
      mutate("assumptions", async (sql) => {
        checkAssumptions(get(), a);
        await upsertAssumptions(sql, a);
      }),

    addScenario: (s) => writeScenario(s),
    saveScenario: (s) => writeScenario(s),
    duplicateScenario: (id, newId, name) =>
      mutate("scenarios", async (sql) => {
        const src = get().scenarios.find((x) => x.id === id);
        if (!src) throw new Error("Scenario not found");
        const copy: Scenario = { ...src, id: newId, name };
        checkScenario(get(), copy, src);
        await upsertScenario(sql, scenarioToRow(copy, new Date()));
      }),
    removeScenario: (id) =>
      mutate("scenarios", (sql) => deleteScenario(sql, id)),

    // Hides a banner: app state, not a data change (ADR 0110).
    dismissSampleBanner: () =>
      mutate("bookkeeping", dismissSampleBanner, false),

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
