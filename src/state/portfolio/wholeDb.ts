// The portfolio store's whole-database actions: CSV preview and import, restore, the
// sample, and the backup export. They never throw: each resolves with a Result whose
// failure is a typed ActionError for the caller to show (see PortfolioState).
import { READ_FAILURES } from "../../data/errors";
import { logFailure, type FailureSite } from "../diagnostics";
import { clearSample, loadSample } from "../../data/seed";
import { confirmRestore, exportBackup } from "../../data/backup";
import { recordBackup } from "../../data/appMeta";
import type { CsvImportPreview } from "../../import/csvImport";
import { localIsoDay } from "../../lib/day";
import { saveFile } from "../../platform/saveFile";
import { checkInputRules } from "../restoreRules";
import { toActionError, type ActionError } from "../actionError";
import { toWriteError } from "../writeError";
import { success, type Result } from "../result";
import type { PortfolioState, StoreCtx } from "./types";

type WholeDbActions = Pick<
  PortfolioState,
  | "previewCsv"
  | "importCsv"
  | "restoreBackup"
  | "restoreAtStartup"
  | "continueAfterRestore"
  | "clearSample"
  | "loadSample"
  | "exportBackup"
>;

/** The failure `e` as a Result, logged under `site` where it was caught, once
 *  (ADR 0147): a refused backup or CSV plan and a non-empty portfolio are the user's to
 *  fix, not failures to log. */
function failed(
  site: FailureSite,
  e: unknown,
  error: ActionError = toActionError(e),
): { ok: false; error: ActionError } {
  if (
    error.kind !== "restoreRefused" &&
    error.kind !== "sampleNotEmpty" &&
    error.kind !== "planRefused"
  )
    logFailure(site, e);
  return { ok: false, error };
}

/** Run `action`: its value, or its failure logged under `site`. */
async function attempt<T>(
  site: FailureSite,
  action: () => Promise<T>,
): Promise<Result<T, ActionError>> {
  try {
    return success(await action());
  } catch (e) {
    return failed(site, e);
  }
}

function csvActions({
  enqueue,
  exclusive,
  requireSql,
}: StoreCtx): Pick<WholeDbActions, "previewCsv" | "importCsv"> {
  return {
    // Loaded on first use: keeps the CSV parser out of the startup bundle.
    previewCsv: async (batch) => {
      try {
        return success(
          await enqueue(async () => {
            const { previewImport } = await import("../../import/csvImport");
            return previewImport(requireSql(), batch);
          }),
        );
      } catch (e) {
        logFailure("IMPORT", e);
        return { ok: false, error: toWriteError(e) };
      }
    },
    importCsv: async (batch) => {
      const plan: { refused?: CsvImportPreview } = {};
      try {
        return success(
          await exclusive("importCsv", async (sql) => {
            const { importCsv, CsvImportProblemsError } =
              await import("../../import/csvImport");
            try {
              return await importCsv(sql, batch);
            } catch (e) {
              // Known here, where the class is loaded, so it stays out of the
              // startup bundle. Nothing was written (ADR 0229 §2).
              if (e instanceof CsvImportProblemsError) plan.refused = e.preview;
              throw e;
            }
          }),
        );
      } catch (e) {
        return failed(
          "IMPORT",
          e,
          plan.refused && { kind: "planRefused", preview: plan.refused },
        );
      }
    },
  };
}

/** Restore from the startup error screen (ADR 0153, ADR 0231). */
function restoreAtStartupAction({
  get,
  exclusive,
}: StoreCtx): WholeDbActions["restoreAtStartup"] {
  return (backup) =>
    attempt("RESTORE", async () => {
      // Only where the database migrated to head and only reading it failed
      // (READ_FAILURES, ADR 0231); any other startup failure leaves a database a
      // restore must not write to.
      const status = get().status;
      if (
        status.kind !== "startupFailed" ||
        !status.startup ||
        !READ_FAILURES.has(status.startup.code)
      )
        throw new Error(
          "A restore at startup needs a ROW_INVALID or SCENARIO_INVALID failure",
        );
      const { safetyBackup } = await exclusive("restore", (sql) =>
        confirmRestore(sql, backup, checkInputRules),
      );
      return {
        safetyBackup,
        ready:
          get().status.kind === "startupFailed" && get().portfolio !== null,
      };
    });
}

/** The actions that replace the data (restore, the sample) and leave the startup screen. */
function replaceActions(
  ctx: StoreCtx,
): Omit<WholeDbActions, "previewCsv" | "importCsv" | "exportBackup"> {
  const { set, get, replaceData } = ctx;
  return {
    restoreBackup: (backup) =>
      attempt("RESTORE", () =>
        replaceData("restore", (sql) =>
          confirmRestore(sql, backup, checkInputRules),
        ),
      ),
    restoreAtStartup: restoreAtStartupAction(ctx),
    continueAfterRestore: () => {
      const s = get();
      if (s.status.kind !== "startupFailed" || s.portfolio === null) return;
      set({ status: { kind: "ready" }, error: null });
    },
    clearSample: () =>
      attempt("SAMPLE", () =>
        replaceData("clearSample", (sql) => clearSample(sql)),
      ),
    loadSample: () =>
      attempt("SAMPLE", () => replaceData("loadSample", loadSample)),
  };
}

function exportActions({
  exclusive,
  requireSql,
  writesSoFar,
  now: clock,
}: StoreCtx): Pick<WholeDbActions, "exportBackup"> {
  return {
    exportBackup: () =>
      attempt("BACKUP", async () => {
        const writesBefore = writesSoFar();
        // One clock read names the file and stamps `exportedAt` (ADR 0149 §6).
        const now = clock();
        const outcome = await exportBackup(requireSql(), {
          now,
          today: localIsoDay(now),
          save: saveFile,
        });
        if (outcome.kind !== "cancelled") {
          // The file is saved; failing to record it must not turn that into an error.
          // "Last backup" is the time the file was saved, after the dialog (ADR 0110).
          const at = clock().toISOString();
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
      }),
  };
}

export function wholeDbActions(ctx: StoreCtx): WholeDbActions {
  return {
    ...csvActions(ctx),
    ...replaceActions(ctx),
    ...exportActions(ctx),
  };
}
