// The portfolio store's state and the types its modules share (#465).
import type { StoreApi } from "zustand";
import type { Sql } from "../../data/sql";
import type {
  Portfolio,
  Assumptions,
  Property,
  Valuation,
  Lease,
  MortgageBlock,
  HoldingCost,
  Scenario,
} from "../../engine";
import type { DataErrorCode, UpgradeStop } from "../../data/errors";
import type { WriteError } from "../writeError";
import type { BackupFile, ExportOutcome } from "../../data/backup";
import type {
  CsvImportBatch,
  CsvImportPreview,
  CsvImportReport,
} from "../../import/csvImport";
import type { BackupState, SampleState } from "../../data/repositories";
import type { PropertyExtras } from "../../data/mappers";
import type { RefusedWrite } from "../writeTargets";
import type { WriteRunner } from "./writeRunner";

export type Status = "idle" | "loading" | "ready" | "error";

/** The outcome of a mutation. Callers (forms, modals) branch on `ok` — e.g. a modal
 *  closes only on success and keeps itself open, showing `error`, on failure. The
 *  store also stashes `error` so a global banner can surface it without every caller
 *  wiring it up. `ok` means the write landed; when reading the data back after it failed,
 *  the store stops on the error screen with `readBackFailed` set (ADR 0228). */
export type MutationResult = { ok: true } | { ok: false; error: WriteError };
/** Address and garage: stored, but not engine inputs (ADR 0184 §3).
 *  @internal test seam: UI tests reach the type through the state facade (ADR 0072). */
export type { PropertyExtras };

/** A typed failure that stopped startup; `upgrade` says how far a stopped upgrade got
 *  (ADR 0153). */
export interface StartupError {
  code: DataErrorCode;
  details: string[];
  upgrade?: UpgradeStop;
}

export interface PortfolioState {
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
  startupError: StartupError | null;
  /** A write committed but reading the data back failed: the app stops on the error
   *  screen, the write still counts as done, and later writes are refused until Try
   *  again reads the data (ADR 0228). */
  readBackFailed: boolean;
  /** Writes refused while `readBackFailed`, once each in the order refused and without
   *  bookkeeping, for the error screen to name; a successful Try again empties it
   *  (ADR 0255). */
  refusedWrites: RefusedWrite[];
  /** Restores, Clear samples and Load samples queued or running. Settings → Backup
   *  waits while one is, across page changes (ADR 0154). */
  replacing: number;
  /** Writes queued or running (`mutate`, `exclusive`, `replaceData`): row write actions
   *  are disabled while any is (ADR 0253). Reads do not count. */
  writesRunning: number;

  init: (open?: () => Promise<Sql>) => Promise<void>;
  /** Load every table into the store. Does not queue itself: outside a queued job, only
   *  `init` calls it. */
  refresh: () => Promise<void>;
  clearError: () => void;
  /** Show `error` in the banner: for a refusal no form is open to show (ADR 0141). */
  showError: (error: WriteError) => void;

  // valuations
  addValuation: (v: Valuation) => Promise<MutationResult>;
  /** Add `v` and save `closedPrev` (the open-ended valuation it succeeds, now with an
   *  end date) in one write (ADR 0099, 0227: the panel calls it without asking). */
  addValuationClosingPrevious: (
    v: Valuation,
    closedPrev: Valuation,
  ) => Promise<MutationResult>;
  saveValuation: (v: Valuation) => Promise<MutationResult>;
  removeValuation: (id: string) => Promise<MutationResult>;
  // leases
  /** Add `l`. Leases never overlap (ADR 0163): the open-ended lease before it ends the
   *  day before `l` starts, in the same write. */
  addLease: (l: Lease) => Promise<MutationResult>;
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
    extra: PropertyExtras,
  ) => Promise<MutationResult>;
  /** An omitted `p.active` keeps the stored flag, so an edit never re-activates. An
   *  omitted `p.funding` keeps the stored record; `{}` clears it (ADR 0119 §8). */
  editProperty: (p: Property, extra: PropertyExtras) => Promise<MutationResult>;
  /** Address/garage aren't engine inputs so `portfolio.properties` drops them; this
   *  reads them straight from the DB to prefill the edit form. */
  getPropertyExtras: (id: string) => Promise<PropertyExtras>;
  setPropertyActive: (id: string, active: boolean) => Promise<MutationResult>;
  removeProperty: (id: string) => Promise<MutationResult>;
  // assumptions
  saveAssumptions: (a: Assumptions) => Promise<MutationResult>;
  // scenarios (what-if overrides)
  addScenario: (s: Scenario) => Promise<MutationResult>;
  saveScenario: (s: Scenario) => Promise<MutationResult>;
  /** Copies scenario `id` under `newId` and `name`; the caller picks the id so it can
   *  select the copy (ADR 0093) and names it in the UI language (ADR 0187). */
  duplicateScenario: (
    id: string,
    newId: string,
    name: string,
  ) => Promise<MutationResult>;
  removeScenario: (id: string) => Promise<MutationResult>;
  // sample portfolio (ADR 0094)
  /** "Keep exploring": hide the sample banner for good. */
  dismissSampleBanner: () => Promise<MutationResult>;
  // whole-database operations. They throw their own typed errors (CsvImportProblemsError,
  // RestoreError, …) for the caller to show, and leave the banner `error` alone on a
  // failure; one that replaces the data (restore, Clear sample, Load sample) clears it
  // on success, since it described the old data (ADR 0154). They throw only before the
  // commit: a failed read-back after it stops on the error screen (ADR 0228).
  /** What a CSV import would add and update (ADR 0096). Reads only; queued behind
   *  pending writes so it sees their result. */
  previewCsv: (batch: CsvImportBatch) => Promise<CsvImportPreview>;
  /** CSV import of the plan built now, in one transaction, then reload. A plan with
   *  problems writes nothing: it refuses with CsvImportProblemsError (ADR 0229). */
  importCsv: (batch: CsvImportBatch) => Promise<CsvImportReport>;
  /** Replace the data with a checked backup (after a safety backup), then reload. */
  restoreBackup: (backup: BackupFile) => Promise<{ safetyBackup: string }>;
  /** Restore from the startup error screen, only after a read failure (ROW_INVALID or
   *  SCENARIO_INVALID, ADR 0231): the database is open and at head there (ADR 0153).
   *  `ready` says the data loaded afterwards; the screen stays until
   *  `continueAfterRestore`, so the safety copy can be named. */
  restoreAtStartup: (
    backup: BackupFile,
  ) => Promise<{ safetyBackup: string; ready: boolean }>;
  /** Leave the startup error screen after a restore whose data loaded. */
  continueAfterRestore: () => void;
  /** Delete the sample properties (after a safety backup), then reload. */
  clearSample: () => Promise<{ safetyBackup: string }>;
  /** Load the sample into an empty portfolio, then reload (ADR 0112). Throws
   *  SampleNotEmptyError when any property exists. */
  loadSample: () => Promise<void>;
  /** Write a backup file through the save dialog. Read-only, so not queued: an open
   *  dialog must not hold up edits. It reads one snapshot, so the file holds one database
   *  state (ADR 0132). A saved file is then recorded (ADR 0110). */
  exportBackup: () => Promise<ExportOutcome>;
}

export type SetState = StoreApi<PortfolioState>["setState"];
/** A store's open database: kept out of its state (#465), so no component reads it. */
export interface DbHandle {
  get: () => Sql | null;
  set: (sql: Sql | null) => void;
}

/** The store's own `set`, `get` and database, for the write runner's steps. */
export interface StoreAccess {
  set: SetState;
  get: () => PortfolioState;
  db: DbHandle;
}

/** What an action module gets from its store: the store's own `set` and `get`, its one
 *  write runner, and the clock. */
export interface StoreCtx extends StoreAccess, WriteRunner {
  now: () => Date;
}
