// Portfolio state: the engine INPUTS (portfolio + assumptions), loaded from SQLite and
// written through on every edit. This is the one-way data flow's source: DB → store →
// (useEngine) → UI. No finance maths here — edits persist, then in-memory state refreshes
// so the memoized engine recomputes (CLAUDE.md §4).
import { create } from "zustand";
import type { Sql } from "../data/sql";
import { EngineInputError, validateInputs, validatePortfolio } from "../engine";
import type {
  Portfolio,
  Assumptions,
  Property,
  Valuation,
  Lease,
  MortgageBlock,
  HoldingCost,
  Scenario,
} from "../engine";
import { migrate } from "../data/migrations";
import { DataError, type DataErrorCode } from "../data/errors";
import { toWriteError, type WriteError } from "./writeError";
import { logFailure } from "../data/errorLog";
import {
  clearSample,
  dismissSampleBanner,
  loadSample,
  seedIfEmpty,
} from "../data/seed";
import {
  confirmRestore,
  exportBackup,
  type BackupFile,
  type ExportOutcome,
} from "../data/backup";
import type {
  CsvImportBatch,
  CsvImportPreview,
  CsvImportReport,
} from "../import/csvImport";
import { checkInputRules } from "../import/inputRules";
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
  markDataChanged,
  recordBackup,
  type BackupState,
  type SampleState,
} from "../data/repositories";
import {
  valuationToRow,
  leaseToRow,
  mortgageBlockToRow,
  holdingCostToRow,
  propertyToRow,
  scenarioToRow,
} from "../data/mappers";
import { isTauri } from "../lib/tauri";
import { perfMark, perfMeasure } from "../lib/perf";
import { localIsoDay } from "../lib/today";
import { saveFile } from "../platform/saveFile";

type Status = "idle" | "loading" | "ready" | "error";

/** `rows` with `row` in place of the row with its id, moved last: the engine reports a
 *  clash between two rows (DUPLICATE_BLOCK_START) on the later-listed one, so the
 *  edited row is the one named. */
function withRow<T extends { id: string }>(rows: T[], row: T): T[] {
  return [...rows.filter((r) => r.id !== row.id), row];
}

/** Throw the engine input rules broken by the rows `ids` of the candidate portfolio
 *  (D-17, D-27, D-37, D-42, D-54), so a form shows the rule before anything is
 *  written (UX-047). Problems in other rows are not this edit's to report. */
function assertRows(candidate: Portfolio, ids: string[]): void {
  const errors = validatePortfolio(candidate).filter(
    (e) => e.id !== undefined && ids.includes(e.id),
  );
  if (errors.length > 0) throw new EngineInputError(errors);
}

/** The outcome of a mutation. Callers (forms, modals) branch on `ok` — e.g. a modal
 *  closes only on success and keeps itself open, showing `error`, on failure. The
 *  store also stashes `error` so a global banner can surface it without every caller
 *  wiring it up. */
export type MutationResult = { ok: true } | { ok: false; error: WriteError };

/** Open + migrate + seed the database. Normally the on-disk Tauri SQLite; lazy so
 *  non-Tauri code paths (e.g. tests) can inject their own opener instead. When running
 *  outside Tauri with the VITE_E2E flag set, it falls back to an in-memory sql.js DB so
 *  the app can boot in a plain browser for the Playwright smoke test (never shipped). */
async function defaultOpen(): Promise<Sql> {
  const inTauri = isTauri();
  // `import.meta.env.DEV` is a build-time literal — `false` in production builds — so this
  // whole branch (and the sql.js + wasm chunk it imports) is dead-code-eliminated from the
  // shipped bundle. The browser fallback exists only for the Playwright E2E (run via the
  // dev server with VITE_E2E=1); production always uses the Tauri SQLite adapter.
  if (import.meta.env.DEV && !inTauri && import.meta.env.VITE_E2E === "1") {
    const { openBrowserSql } = await import("../data/browserSql");
    const sql = await openBrowserSql();
    await migrate(sql);
    await seedIfEmpty(sql);
    return sql;
  }
  const { openTauriSql } = await import("../data/tauriSql");
  const sql = await openTauriSql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

interface PortfolioState {
  sql: Sql | null;
  portfolio: Portfolio | null;
  assumptions: Assumptions | null;
  scenarios: Scenario[];
  /** The first-run sample: still in place, and its banner dismissed (ADR 0094). */
  sample: SampleState;
  /** The last recorded export and whether the data changed since (ADR 0110). */
  backup: BackupState;
  status: Status;
  /** The last failed write (or the startup failure), translated by the UI. */
  error: WriteError | null;
  /** A typed data-layer failure that stopped startup (P5a), for a translated screen. */
  startupError: { code: DataErrorCode; details: string[] } | null;
  /** The reload after a write failed, so the screen may not show what is on disk
   *  (DR-086). Cleared by the next successful load. */
  stale: boolean;

  init: (open?: () => Promise<Sql>) => Promise<void>;
  refresh: () => Promise<void>;
  /** The banner's Reload: refresh, keeping `stale` set when it fails again. */
  reload: () => Promise<void>;
  clearError: () => void;

  // valuations
  addValuation: (v: Valuation) => Promise<MutationResult>;
  /** Add `v` and save `closedPrev` (the open-ended valuation it succeeds, now with an
   *  end date) in one write (ADR 0099). */
  addValuationClosingPrevious: (
    v: Valuation,
    closedPrev: Valuation,
  ) => Promise<MutationResult>;
  saveValuation: (v: Valuation) => Promise<MutationResult>;
  removeValuation: (id: string) => Promise<MutationResult>;
  // leases
  addLease: (l: Lease) => Promise<MutationResult>;
  /** Add `l` and save `closedPrev` with its new end date in one write (ADR 0099). */
  addLeaseClosingPrevious: (
    l: Lease,
    closedPrev: Lease,
  ) => Promise<MutationResult>;
  saveLease: (l: Lease) => Promise<MutationResult>;
  removeLease: (id: string) => Promise<MutationResult>;
  // mortgage blocks
  addMortgageBlock: (m: MortgageBlock) => Promise<MutationResult>;
  saveMortgageBlock: (m: MortgageBlock) => Promise<MutationResult>;
  removeMortgageBlock: (id: string) => Promise<MutationResult>;
  // holding costs (one row per property)
  saveHoldingCost: (h: HoldingCost) => Promise<MutationResult>;
  // properties
  addProperty: (
    p: Property,
    cost: HoldingCost,
    extra?: { address?: string | null; garage?: boolean | null },
  ) => Promise<MutationResult>;
  /** An omitted `p.active` keeps the stored flag, so an edit never re-activates. */
  editProperty: (
    p: Property,
    extra: { address?: string | null; garage?: boolean | null },
  ) => Promise<MutationResult>;
  /** Address/garage aren't engine inputs so `portfolio.properties` drops them; this
   *  reads them straight from the DB to prefill the edit form. */
  getPropertyExtras: (
    id: string,
  ) => Promise<{ address: string | null; garage: boolean | null }>;
  setPropertyActive: (id: string, active: boolean) => Promise<MutationResult>;
  removeProperty: (id: string) => Promise<MutationResult>;
  // assumptions
  saveAssumptions: (a: Assumptions) => Promise<MutationResult>;
  // scenarios (what-if overrides)
  addScenario: (s: Scenario) => Promise<MutationResult>;
  saveScenario: (s: Scenario) => Promise<MutationResult>;
  /** Copies scenario `id` under `newId`; the caller picks the id so it can select the
   *  copy (ADR 0093). */
  duplicateScenario: (id: string, newId: string) => Promise<MutationResult>;
  removeScenario: (id: string) => Promise<MutationResult>;
  // sample portfolio (ADR 0094)
  /** "Keep exploring": hide the sample banner for good. */
  dismissSampleBanner: () => Promise<MutationResult>;
  // whole-database operations. They throw their own typed errors (CsvImportError,
  // RestoreError, …) for the page to show, and leave the banner `error` alone.
  /** What a CSV import would add and update (ADR 0096). Reads only; queued behind
   *  pending writes so it sees their result. */
  previewCsv: (batch: CsvImportBatch) => Promise<CsvImportPreview>;
  /** CSV import in one transaction, then reload. With `expected` (the previewed
   *  plan's fingerprint) it refuses with CsvPlanChangedError if the plan changed. */
  importCsv: (
    batch: CsvImportBatch,
    expected?: string,
  ) => Promise<CsvImportReport>;
  /** Replace the data with a checked backup (after a safety backup), then reload. */
  restoreBackup: (backup: BackupFile) => Promise<{ safetyBackup: string }>;
  /** Delete the sample properties (after a safety backup), then reload. */
  clearSample: () => Promise<{ safetyBackup: string }>;
  /** Load the sample into an empty portfolio, then reload (ADR 0112). Throws
   *  SampleNotEmptyError when any property exists. */
  loadSample: () => Promise<void>;
  /** Write a backup file through the save dialog. Read-only, so not queued: an open
   *  dialog must not hold up edits. A saved file is then recorded (ADR 0110). */
  exportBackup: () => Promise<ExportOutcome>;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => {
  /** Tail of the mutation queue: each mutation (write + refresh) starts only after the
   *  previous one settled, so writes reach the DB in call order and a refresh never
   *  interleaves with another write (DR-085). */
  let queue: Promise<unknown> = Promise.resolve();
  /** Data writes so far: an export keeps the changed flag when one landed while its
   *  save dialog was open, since the file does not hold it (ADR 0110). */
  let writes = 0;

  function mutate(
    op: (sql: Sql) => Promise<void>,
    changesData = true,
  ): Promise<MutationResult> {
    const run = queue.then(() => mutateNow(op, changesData));
    queue = run;
    return run;
  }

  /** Run `op` in the mutation queue, then reload; rethrow its failure unchanged
   *  (after reconciling in-memory state with the DB). For operations whose callers
   *  show their own typed errors (DR-047: pages no longer touch the raw `sql`). */
  function exclusive<T>(
    op: (sql: Sql) => Promise<T>,
    changesData = true,
  ): Promise<T> {
    const run = queue.then(async () => {
      const sql = requireSql();
      try {
        const result = await op(sql);
        if (changesData) await markChanged(sql);
        await reconcile();
        return result;
      } catch (e) {
        try {
          await reconcile();
        } catch {
          // a secondary failure while reconciling shouldn't mask the original error
        }
        throw e;
      }
    });
    queue = run.catch(() => undefined);
    return run;
  }

  /** Reload after a write; on failure mark the state stale and rethrow. */
  async function reconcile(): Promise<void> {
    try {
      await get().refresh();
    } catch (e) {
      set({ stale: true });
      throw e;
    }
  }

  /** Data was written: the last backup no longer has it (ADR 0110). Best effort — a
   *  failure is logged and never fails the write that already succeeded. */
  async function markChanged(sql: Sql): Promise<void> {
    writes += 1;
    try {
      await markDataChanged(sql);
    } catch (e) {
      logFailure("WRITE", e);
    }
  }

  function requireSql(): Sql {
    const sql = get().sql;
    if (!sql) throw new Error("Database not initialised");
    return sql;
  }

  /** Persist via `op`, then reload portfolio + assumptions so the engine recomputes.
   *  Never throws into the void: a failure is captured, surfaced via `error`, and
   *  returned to the caller as `{ ok: false }`. On failure we still `refresh()` so the
   *  in-memory state matches what actually reached disk. Multi-statement writes are
   *  atomic (`Sql.transaction`, D-14), so a failed op leaves the DB unchanged. */
  async function mutateNow(
    op: (sql: Sql) => Promise<void>,
    changesData: boolean,
  ): Promise<MutationResult> {
    const sql = get().sql;
    if (!sql) {
      const error = toWriteError(new Error("Database not initialised"));
      set({ error });
      return { ok: false, error };
    }
    try {
      perfMark("edit:start");
      await op(sql);
      if (changesData) await markChanged(sql);
      await reconcile();
      // Write + reload; the recompute and page render are measured where they run.
      perfMeasure("edit-saved", "edit:start");
      set({ error: null });
      return { ok: true };
    } catch (e) {
      // A broken input rule is the user's to fix in the form, not a failure to log;
      // it is thrown before anything is written, so there is nothing to reconcile.
      if (e instanceof EngineInputError) {
        const error = toWriteError(e);
        set({ error });
        return { ok: false, error };
      }
      logFailure("WRITE", e);
      const error = toWriteError(e);
      try {
        await reconcile();
      } catch {
        // a secondary failure while reconciling shouldn't mask the original error
      }
      set({ error });
      return { ok: false, error };
    }
  }

  /** Check the loaded portfolio with `edit` applied for the rows `ids`. Runs inside the
   *  queued op, so it sees every earlier write. */
  function checkEdit(edit: (p: Portfolio) => Portfolio, ids: string[]): void {
    const p = get().portfolio;
    if (p) assertRows(edit(p), ids);
  }

  /** Engine rules of the assumptions themselves (horizon, rates, shocks, D-38). */
  function checkAssumptions(a: Assumptions): void {
    const p = get().portfolio;
    if (!p) return;
    const errors = validateInputs(p, a).filter(
      (e) => e.entity === "assumptions",
    );
    if (errors.length > 0) throw new EngineInputError(errors);
  }

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
    stale: false,

    async init(open = defaultOpen) {
      if (get().status === "loading" || get().status === "ready") return;
      set({ status: "loading", error: null, startupError: null });
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
              ? { code: e.code, details: e.details }
              : null,
        });
      }
    },

    async refresh() {
      const sql = get().sql;
      if (!sql) return;
      // One point-in-time snapshot of every table (DR-134).
      const { portfolio, assumptions, scenarios, sample, backup } =
        await loadState(sql);
      set({ portfolio, assumptions, scenarios, sample, backup, stale: false });
    },

    clearError: () => set({ error: null }),

    async reload() {
      try {
        await get().refresh();
      } catch (e) {
        logFailure("WRITE", e);
        set({ stale: true });
      }
    },

    addValuation: (v) =>
      mutate(async (sql) => {
        checkEdit(
          (p) => ({ ...p, valuations: withRow(p.valuations, v) }),
          [v.id],
        );
        await insertValuation(sql, valuationToRow(v));
      }),
    addValuationClosingPrevious: (v, closedPrev) =>
      mutate(async (sql) => {
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
      mutate(async (sql) => {
        checkEdit(
          (p) => ({ ...p, valuations: withRow(p.valuations, v) }),
          [v.id],
        );
        await updateValuation(sql, v);
      }),
    removeValuation: (id) => mutate((sql) => deleteValuation(sql, id)),

    addLease: (l) =>
      mutate(async (sql) => {
        checkEdit((p) => ({ ...p, leases: withRow(p.leases, l) }), [l.id]);
        await insertLease(sql, leaseToRow(l));
      }),
    addLeaseClosingPrevious: (l, closedPrev) =>
      mutate(async (sql) => {
        checkEdit(
          (p) => ({ ...p, leases: withRow(withRow(p.leases, closedPrev), l) }),
          [l.id, closedPrev.id],
        );
        await insertLeaseClosingPrevious(sql, l, closedPrev);
      }),
    saveLease: (l) =>
      mutate(async (sql) => {
        checkEdit((p) => ({ ...p, leases: withRow(p.leases, l) }), [l.id]);
        await updateLease(sql, l);
      }),
    removeLease: (id) => mutate((sql) => deleteLease(sql, id)),

    addMortgageBlock: (m) =>
      mutate(async (sql) => {
        checkEdit(
          (p) => ({ ...p, mortgages: withRow(p.mortgages, m) }),
          [m.id],
        );
        await insertMortgageBlock(sql, mortgageBlockToRow(m));
      }),
    saveMortgageBlock: (m) =>
      mutate(async (sql) => {
        checkEdit(
          (p) => ({ ...p, mortgages: withRow(p.mortgages, m) }),
          [m.id],
        );
        await updateMortgageBlock(sql, m);
      }),
    removeMortgageBlock: (id) => mutate((sql) => deleteMortgageBlock(sql, id)),

    saveHoldingCost: (h) =>
      mutate(async (sql) => {
        checkEdit(
          (p) => ({ ...p, holdingCosts: withRow(p.holdingCosts, h) }),
          [h.id],
        );
        await updateHoldingCost(sql, h);
      }),

    addProperty: (p, cost, extra) =>
      mutate(async (sql) => {
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
      mutate(async (sql) => {
        const stored = get().portfolio?.properties.find(
          (x) => x.id === edited.id,
        );
        const p = { ...edited, active: edited.active ?? stored?.active };
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
      mutate((sql) => setPropertyActive(sql, id, active)),
    removeProperty: (id) => mutate((sql) => deleteProperty(sql, id)),

    saveAssumptions: (a) =>
      mutate(async (sql) => {
        checkAssumptions(a);
        await upsertAssumptions(sql, a);
      }),

    addScenario: (s) => mutate((sql) => upsertScenario(sql, scenarioToRow(s))),
    saveScenario: (s) => mutate((sql) => upsertScenario(sql, scenarioToRow(s))),
    duplicateScenario: (id, newId) =>
      mutate(async (sql) => {
        const src = get().scenarios.find((x) => x.id === id);
        if (!src) throw new Error("Scenario not found");
        const copy: Scenario = {
          ...src,
          id: newId,
          name: `${src.name} (copy)`,
          createdAt: new Date(),
        };
        await upsertScenario(sql, scenarioToRow(copy));
      }),
    removeScenario: (id) => mutate((sql) => deleteScenario(sql, id)),

    // Hides a banner: app state, not a data change (ADR 0110).
    dismissSampleBanner: () => mutate(dismissSampleBanner, false),

    // Loaded on first use: keeps the CSV parser out of the startup bundle (P9).
    previewCsv: (batch) => {
      const run = queue.then(async () => {
        const { previewImport } = await import("../import/csvImport");
        return previewImport(requireSql(), batch);
      });
      queue = run.catch(() => undefined);
      return run;
    },
    importCsv: (batch, expected) =>
      exclusive(async (sql) => {
        const { importCsv } = await import("../import/csvImport");
        return importCsv(sql, batch, expected);
      }),
    restoreBackup: (backup) =>
      exclusive((sql) => confirmRestore(sql, backup, checkInputRules)),
    clearSample: () => exclusive((sql) => clearSample(sql)),
    loadSample: () => exclusive(loadSample),
    exportBackup: async () => {
      const writesBefore = writes;
      const outcome = await exportBackup(requireSql(), {
        today: localIsoDay(),
        save: saveFile,
      });
      if (outcome.kind !== "cancelled") {
        // The file is saved; failing to record it must not turn that into an error.
        const at = new Date().toISOString();
        await exclusive(
          (sql) =>
            recordBackup(sql, at, outcome.filename, writes === writesBefore),
          false,
        ).catch((e: unknown) => logFailure("BACKUP", e));
      }
      return outcome;
    },
  };
});
