// The portfolio store's whole-database actions (#465): CSV preview and import, restore,
// the sample, and the backup export. They throw their own typed errors for the caller to
// show (see PortfolioState).
import { READ_FAILURES } from "../../data/errors";
import { logFailure } from "../../data/errorLog";
import { clearSample, loadSample } from "../../data/seed";
import { confirmRestore, exportBackup } from "../../data/backup";
import { recordBackup } from "../../data/repositories";
import { localIsoDay } from "../../lib/day";
import { saveFile } from "../../platform/saveFile";
import { checkInputRules } from "../restoreRules";
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

function csvActions({
  enqueue,
  exclusive,
  requireSql,
}: StoreCtx): Pick<WholeDbActions, "previewCsv" | "importCsv"> {
  return {
    // Loaded on first use: keeps the CSV parser out of the startup bundle (P9).
    previewCsv: (batch) =>
      enqueue(async () => {
        const { previewImport } = await import("../../import/csvImport");
        return previewImport(requireSql(), batch);
      }),
    importCsv: (batch) =>
      exclusive("importCsv", async (sql) => {
        const { importCsv } = await import("../../import/csvImport");
        return importCsv(sql, batch);
      }),
  };
}

/** The actions that replace the data (restore, the sample) and leave the startup screen. */
function replaceActions({
  set,
  get,
  exclusive,
  replaceData,
}: StoreCtx): Omit<
  WholeDbActions,
  "previewCsv" | "importCsv" | "exportBackup"
> {
  return {
    restoreBackup: (backup) =>
      replaceData("restore", (sql) =>
        confirmRestore(sql, backup, checkInputRules),
      ),
    restoreAtStartup: async (backup) => {
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
    },
    continueAfterRestore: () => {
      const s = get();
      if (s.status.kind !== "startupFailed" || s.portfolio === null) return;
      set({ status: { kind: "ready" }, error: null });
    },
    clearSample: () => replaceData("clearSample", (sql) => clearSample(sql)),
    loadSample: () => replaceData("loadSample", loadSample),
  };
}

function exportActions({
  exclusive,
  requireSql,
  writesSoFar,
  now: clock,
}: StoreCtx): Pick<WholeDbActions, "exportBackup"> {
  return {
    exportBackup: async () => {
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
    },
  };
}

export function wholeDbActions(ctx: StoreCtx): WholeDbActions {
  return {
    ...csvActions(ctx),
    ...replaceActions(ctx),
    ...exportActions(ctx),
  };
}
