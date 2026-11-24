import { useEffect, useMemo, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { AppShell } from "../components/AppShell";
import { Panel, ErrorBanner } from "../components/primitives";
import {
  parseProperties,
  parseValuations,
  parseRents,
  parseMortgages,
  propertiesTemplate,
  valuationsTemplate,
  rentsTemplate,
  mortgagesTemplate,
  type ParsedPropertyRow,
  type ParsedValuationRow,
  type ParsedRentRow,
  type ParsedMortgageRow,
  type CsvImportPreview,
} from "../../state/csv";
import { useUiStore } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import { importCounts } from "../model/importPreview";
import type { WriteError } from "../../state/writeError";
import { useToast } from "../hooks/useToast";
import { useBusyFocus, type BusyFocusTarget } from "../hooks/useBusyFocus";

import {
  IMPORT_BUTTON,
  ImportActions,
  ImportFilesPanel,
  ImportSummary,
  RefusedTable,
  type FileState,
} from "./ImportPanels";

const REPORT_HEADING = "import-report-title";

/** Where focus goes once an import ends (ADR 0248 §2–§3). A success clears the files and
 *  with them the Import panel: the report heading. Otherwise Import, also after the
 *  overwrite confirm that left; the panel heading when a refused plan disabled Import. */
const afterImport: BusyFocusTarget = (_trigger, panel) => {
  if (!panel?.isConnected) return document.getElementById(REPORT_HEADING);
  const run = document.getElementById(IMPORT_BUTTON);
  return run && !run.matches(":disabled") ? run : panel.querySelector("h2");
};

export function Import() {
  const t = useT();
  const importCsv = usePortfolioStore((s) => s.importCsv);
  const previewCsv = usePortfolioStore((s) => s.previewCsv);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const lastImport = useUiStore((s) => s.lastImport);
  const setLastImport = useUiStore((s) => s.setLastImport);
  const openProperty = useUiStore((s) => s.openProperty);
  const setFailure = useUiStore((s) => s.setFailure);
  const dismissFailure = useUiStore((s) => s.dismissFailure);

  const [properties, setProperties] =
    useState<FileState<ParsedPropertyRow> | null>(null);
  const [valuations, setValuations] =
    useState<FileState<ParsedValuationRow> | null>(null);
  const [rents, setRents] = useState<FileState<ParsedRentRow> | null>(null);
  const [mortgages, setMortgages] =
    useState<FileState<ParsedMortgageRow> | null>(null);
  const [importing, setImporting] = useBusyFocus(afterImport);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  // Why the last preview failed (ADR 0147); translated at render, like the import failure's notice.
  const [previewFailure, setPreviewFailure] = useState<{
    error: WriteError;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { showToast } = useToast();

  // Each file is parsed once, on its own. Whether a child row's property exists is the
  // import plan's check, at the preview and at the click (ADR 0254).
  function handleProperties(name: string, bytes: Uint8Array) {
    setProperties({ name, result: parseProperties(bytes) });
  }

  function handleValuations(name: string, bytes: Uint8Array) {
    setValuations({ name, result: parseValuations(bytes) });
  }

  function handleRents(name: string, bytes: Uint8Array) {
    setRents({ name, result: parseRents(bytes) });
  }

  function handleMortgages(name: string, bytes: Uint8Array) {
    setMortgages({ name, result: parseMortgages(bytes) });
  }

  const hasAnyFile = !!(properties || valuations || rents || mortgages);
  const allValid = [properties, valuations, rents, mortgages].every(
    (f) => !f || f.result.errors.length === 0,
  );
  const batch = useMemo(
    () => ({
      properties: properties?.result.rows,
      valuations: valuations?.result.rows,
      rents: rents?.result.rows,
      mortgages: mortgages?.result.rows,
    }),
    [properties, valuations, rents, mortgages],
  );

  // ADR 0096: once every chosen file is valid, preview what the import would do; again
  // whenever the files or the stored data change. A change first closes the confirm row
  // and drops the preview, so Import waits for the new one (ADR 0240; during render, not
  // in the effect). `batch` changes whenever a file does, so it also covers hasAnyFile and
  // allValid.
  const [seen, setSeen] = useState({ batch, portfolio, previewCsv });
  if (
    batch !== seen.batch ||
    portfolio !== seen.portfolio ||
    previewCsv !== seen.previewCsv
  ) {
    setSeen({ batch, portfolio, previewCsv });
    setConfirming(false);
    setPreviewFailure(null);
    setPreview(null);
  }
  useEffect(() => {
    if (!hasAnyFile || !allValid) return;
    let current = true;
    // The store logs a failure (ADR 0147).
    void previewCsv(batch).then((previewed) => {
      if (!current) return;
      if (previewed.ok) setPreview(previewed.value);
      else {
        setPreview(null);
        setPreviewFailure({ error: previewed.error });
      }
    });
    return () => {
      current = false;
    };
  }, [batch, hasAnyFile, allValid, portfolio, previewCsv]);

  const counts = importCounts(preview?.items ?? []);
  const toWrite = counts.added + counts.updated;
  const planOk = preview !== null && preview.problems.length === 0;
  const canImport =
    hasAnyFile && allValid && planOk && toWrite > 0 && !importing;

  async function runImport(confirmed: boolean) {
    if (!canImport || !preview) return;
    // Updates overwrite stored records, and an added loan block can stop saved loan
    // events: ask first (ADR 0096, ADR 0160).
    if ((counts.updated > 0 || counts.replacing > 0) && !confirmed) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setImporting(true);
    dismissFailure();
    try {
      const imported = await importCsv(batch);
      if (imported.ok) {
        setLastImport(imported.value);
        // Imported: clear the files so a second click cannot import them again (UX-038).
        setProperties(null);
        setValuations(null);
        setRents(null);
        setMortgages(null);
        showToast(t.importPage.importComplete);
      }
      // Import is one transaction: only a failure before the commit lands here, so
      // nothing was written (DR-023). A failed read-back after it succeeds, and the app
      // stops on the error screen (ADR 0228).
      else if (imported.error.kind === "planRefused") {
        // The plan built at the click has problems: show them as the preview does,
        // which also disables Import (ADR 0229 §2).
        setPreview(imported.error.preview);
      } else {
        // Logged by the store. A constraint the CSV checks missed (a generated-id clash
        // was one, now fixed: DR-137) gets the translated wording, not SQLite's text. In
        // the notice, so it reaches the owner on any page (ADR 0154).
        setFailure("import", imported.error);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell
      title={t.importPage.title}
      subtitle={t.importPage.subtitle}
      showLens={false}
    >
      <ImportFilesPanel
        files={[
          {
            key: "properties",
            title: t.importPage.propertiesTitle,
            file: "properties.csv",
            templateFn: propertiesTemplate,
            fileState: properties,
            onFile: handleProperties,
          },
          {
            key: "valuations",
            title: t.importPage.valuationsTitle,
            file: "valuations.csv",
            templateFn: valuationsTemplate,
            fileState: valuations,
            onFile: handleValuations,
          },
          {
            key: "rents",
            title: t.importPage.rentsTitle,
            file: "rents.csv",
            templateFn: rentsTemplate,
            fileState: rents,
            onFile: handleRents,
          },
          {
            key: "mortgages",
            title: t.importPage.mortgagesTitle,
            file: "mortgages.csv",
            templateFn: mortgagesTemplate,
            fileState: mortgages,
            onFile: handleMortgages,
          },
        ]}
      />

      {hasAnyFile && (
        <Panel title={t.importPage.importTitle}>
          {!allValid && (
            <p className="error-text mb-s3">{t.importPage.fixErrors}</p>
          )}
          {/* No dismiss: Import stays unavailable until a new preview, so the reason
              stays on screen (ADR 0175). */}
          {previewFailure && (
            <div className="mb-s3">
              <ErrorBanner
                message={t.importPage.previewFailed(
                  describeWriteError(t, previewFailure.error).message,
                )}
              />
            </div>
          )}
          {preview && preview.problems.length > 0 && (
            <RefusedTable problems={preview.problems} />
          )}
          {planOk && (
            <div className="mb-s3">
              <ImportSummary items={preview.items} mode="preview" />
              {toWrite === 0 && preview.items.length > 0 && (
                <p className="mt-s3">{t.importPage.nothingToImport}</p>
              )}
            </div>
          )}
          <ImportActions
            scope={planOk && toWrite > 0 ? toWrite : null}
            counts={counts}
            importing={importing}
            disabled={!canImport || confirming}
            confirming={confirming}
            onRun={(confirmed) => void runImport(confirmed)}
            onCancel={() => setConfirming(false)}
          />
        </Panel>
      )}

      {lastImport && (
        <Panel title={t.importPage.reportTitle} headingId={REPORT_HEADING}>
          <ImportSummary
            items={lastImport.items}
            mode="report"
            onOpenProperty={openProperty}
          />
        </Panel>
      )}
    </AppShell>
  );
}
