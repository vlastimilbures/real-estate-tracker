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
  CsvImportProblemsError,
  type CsvImportPreview,
} from "../../state/csv";
import { useUiStore } from "../../state/uiStore";
import { logFailure } from "../../state/diagnostics";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import { importCounts } from "../model/importPreview";
import { toWriteError } from "../../state/writeError";
import { useToast } from "../hooks/useToast";
import { useBusyFocus, type BusyFocusTarget } from "../hooks/useBusyFocus";

import {
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
  const run = panel.querySelector<HTMLButtonElement>(".row > .btn.primary");
  return run && !run.disabled ? run : panel.querySelector("h2");
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
    error: unknown;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { showToast } = useToast();

  // FK-aware parsers: check child rows against known property names. Read from the
  // stored portfolio, not the engine, so Import opens even when stored data breaks an
  // engine rule (ADR 0146).
  const storedNames = (portfolio?.properties ?? []).map((p) => p.name);
  function knownNames(): Set<string> {
    const fromDb = new Set<string>(storedNames);
    const fromCsv = properties?.result.rows.map((r) => r.name) ?? [];
    return new Set([...fromDb, ...fromCsv]);
  }

  function handleProperties(name: string, bytes: Uint8Array) {
    const result = parseProperties(bytes);
    setProperties({ name, bytes, result });
    // Re-validate children FK with updated known names
    const newNames = new Set([
      ...storedNames,
      ...result.rows.map((r) => r.name),
    ]);
    if (valuations)
      setValuations({
        ...valuations,
        result: parseValuations(valuations.bytes, newNames),
      });
    if (rents)
      setRents({ ...rents, result: parseRents(rents.bytes, newNames) });
    if (mortgages)
      setMortgages({
        ...mortgages,
        result: parseMortgages(mortgages.bytes, newNames),
      });
  }

  function handleValuations(name: string, bytes: Uint8Array) {
    setValuations({
      name,
      bytes,
      result: parseValuations(bytes, knownNames()),
    });
  }

  function handleRents(name: string, bytes: Uint8Array) {
    setRents({ name, bytes, result: parseRents(bytes, knownNames()) });
  }

  function handleMortgages(name: string, bytes: Uint8Array) {
    setMortgages({
      name,
      bytes,
      result: parseMortgages(bytes, knownNames()),
    });
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
    previewCsv(batch).then(
      (p) => {
        if (current) setPreview(p);
      },
      (e: unknown) => {
        logFailure("IMPORT", e);
        if (current) {
          setPreview(null);
          setPreviewFailure({ error: e });
        }
      },
    );
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
      const report = await importCsv(batch);
      setLastImport(report);
      // Imported: clear the files so a second click cannot import them again (UX-038).
      setProperties(null);
      setValuations(null);
      setRents(null);
      setMortgages(null);
      showToast(t.importPage.importComplete);
    } catch (e) {
      // Import is one transaction: only a failure before the commit lands here, so
      // nothing was written (DR-023). A failed read-back after it resolves, and the app
      // stops on the error screen (ADR 0228).
      if (e instanceof CsvImportProblemsError) {
        // The plan built at the click has problems: show them as the preview does,
        // which also disables Import (ADR 0229 §2).
        setPreview(e.preview);
      } else {
        logFailure("IMPORT", e);
        // A constraint the CSV checks missed (a generated-id clash was one, now fixed: DR-137)
        // gets the translated wording, not SQLite's text. In the notice, so it reaches the
        // owner on any page (ADR 0154).
        setFailure("import", e);
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
                  describeWriteError(t, toWriteError(previewFailure.error))
                    .message,
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
