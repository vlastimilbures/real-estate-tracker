// The Import page's session as a hook: the reducer of ui/model/importSession, the
// preview it runs and the import.
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import {
  parseMortgages,
  parseProperties,
  parseRents,
  parseValuations,
} from "../../state/csv";
import {
  allValid,
  hasAnyFile,
  importBatch,
  importSession,
  initialImportSession,
  sessionView,
  type FileKind,
  type ImportFiles,
  type ImportEvent,
  type StoreBasis,
} from "../model/importSession";
import { useBusyFocus, type BusyFocusTarget } from "./useBusyFocus";
import { useT } from "./useT";
import { useToast } from "./useToast";

type PreviewCsv = ReturnType<typeof usePortfolioStore.getState>["previewCsv"];

/** The `fileChosen` event for a file of `kind`, parsed. */
function chosen(kind: FileKind, name: string, bytes: Uint8Array): ImportEvent {
  switch (kind) {
    case "properties":
      return {
        type: "fileChosen",
        kind,
        file: { name, result: parseProperties(bytes) },
      };
    case "valuations":
      return {
        type: "fileChosen",
        kind,
        file: { name, result: parseValuations(bytes) },
      };
    case "rents":
      return {
        type: "fileChosen",
        kind,
        file: { name, result: parseRents(bytes) },
      };
    case "mortgages":
      return {
        type: "fileChosen",
        kind,
        file: { name, result: parseMortgages(bytes) },
      };
  }
}

/** The preview: once every chosen file is valid, what the import would do; again
 *  whenever the files or the stored data change (ADR 0096). A preview that arrives for
 *  inputs since replaced is dropped. */
function usePreview(
  files: ImportFiles,
  portfolio: unknown,
  previewCsv: PreviewCsv,
  dispatch: (e: ImportEvent) => void,
) {
  const batch = useMemo(() => importBatch(files), [files]);
  const ready = hasAnyFile(files) && allValid(files);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    const basis = { portfolio, previewCsv, files };
    // The store logs a failure (ADR 0147).
    void previewCsv(batch).then((previewed) => {
      if (!current) return;
      if (previewed.ok)
        dispatch({ type: "previewArrived", basis, preview: previewed.value });
      else dispatch({ type: "previewFailed", basis, error: previewed.error });
    });
    return () => {
      current = false;
    };
  }, [batch, files, ready, portfolio, previewCsv, dispatch]);
  // What was shown for the stored data before it changed goes (ADR 0240). It stopped
  // counting at once; this only drops it from the session.
  useEffect(() => {
    dispatch({ type: "storeChanged", store: { portfolio, previewCsv } });
  }, [portfolio, previewCsv, dispatch]);
  return batch;
}

export function useImportSession(afterImport: BusyFocusTarget) {
  const t = useT();
  const importCsv = usePortfolioStore((s) => s.importCsv);
  const previewCsv = usePortfolioStore((s) => s.previewCsv);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const setLastImport = useUiStore((s) => s.setLastImport);
  const setFailure = useUiStore((s) => s.setFailure);
  const dismissFailure = useUiStore((s) => s.dismissFailure);
  const { showToast } = useToast();
  const [importing, setImporting] = useBusyFocus(afterImport);
  const [session, dispatch] = useReducer(importSession, initialImportSession);
  const store = { portfolio, previewCsv };
  // The store as the page last showed it: a refusal is shown for that.
  const shown = useRef<StoreBasis>(store);
  useLayoutEffect(() => {
    shown.current = { portfolio, previewCsv };
  }, [portfolio, previewCsv]);
  const batch = usePreview(session.files, portfolio, previewCsv, dispatch);
  const view = sessionView(session, store, importing);

  async function runImport(confirmed: boolean) {
    if (!view.canImport || !view.preview) return;
    // Updates overwrite stored records, and an added loan block can stop saved loan
    // events: ask first (ADR 0096, ADR 0160).
    if ((view.counts.updated > 0 || view.counts.replacing > 0) && !confirmed) {
      dispatch({
        type: "confirmAsked",
        basis: { ...store, files: session.files },
      });
      return;
    }
    dispatch({ type: "importStarted" });
    setImporting(true);
    dismissFailure();
    try {
      const imported = await importCsv(batch);
      if (imported.ok) {
        setLastImport(imported.value);
        dispatch({ type: "importDone" });
        showToast(t.importPage.importComplete);
      }
      // Import is one transaction: only a failure before the commit lands here, so
      // nothing was written. A failed read-back after it succeeds, and the app
      // stops on the error screen (ADR 0228).
      else if (imported.error.kind === "planRefused") {
        // The plan built at the click has problems: show them as the preview does,
        // which also disables Import (ADR 0229 §2).
        dispatch({
          type: "importRefused",
          store: shown.current,
          preview: imported.error.preview,
        });
      } else {
        // Logged by the store. A constraint the CSV checks missed gets the translated
        // wording, not SQLite's text. In the notice, so it reaches the owner on any page
        // (ADR 0154).
        setFailure("import", imported.error);
      }
    } finally {
      setImporting(false);
    }
  }

  return {
    files: session.files,
    view,
    importing,
    chooseFile: (kind: FileKind, name: string, bytes: Uint8Array) =>
      dispatch(chosen(kind, name, bytes)),
    runImport,
    cancelConfirm: () => dispatch({ type: "confirmCancelled" }),
  };
}
