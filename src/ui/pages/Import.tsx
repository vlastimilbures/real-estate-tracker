import { useEffect, useMemo, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { AppShell } from "../components/AppShell";
import { Panel, Button, ErrorBanner } from "../components/primitives";
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
  CsvImportError,
  CsvPlanChangedError,
  type CsvImportPreview,
  type CsvImportProblem,
} from "../../state/csv";
import { useUiStore } from "../../state/uiStore";
import { logFailure } from "../../state/diagnostics";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import { importCounts } from "../model/importPreview";
import { toWriteError } from "../../state/writeError";
import { useToast } from "../hooks/useToast";

import {
  EntityImportPanel,
  ImportSummary,
  RefusedTable,
  type FileState,
} from "./ImportPanels";

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
  const [importing, setImporting] = useState(false);
  const [refused, setRefused] = useState<CsvImportProblem[] | null>(null);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  // Why the last preview failed (ADR 0147); translated at render, like the import failure's notice.
  const [previewFailure, setPreviewFailure] = useState<{
    error: unknown;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [planChanged, setPlanChanged] = useState(false);
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
  // and drops a preview that no longer applies (during render, not in the effect).
  // `batch` changes whenever a file does, so it also covers hasAnyFile and allValid.
  const [seen, setSeen] = useState({ batch, portfolio, previewCsv });
  if (
    batch !== seen.batch ||
    portfolio !== seen.portfolio ||
    previewCsv !== seen.previewCsv
  ) {
    setSeen({ batch, portfolio, previewCsv });
    setConfirming(false);
    setPreviewFailure(null);
    if (!hasAnyFile || !allValid) setPreview(null);
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
    setRefused(null);
    setPlanChanged(false);
    try {
      const report = await importCsv(batch, preview.fingerprint);
      setLastImport(report);
      // Imported: clear the files so a second click cannot import them again (UX-038).
      setProperties(null);
      setValuations(null);
      setRents(null);
      setMortgages(null);
      showToast(t.importPage.importComplete);
    } catch (e) {
      // Import is one transaction: only a failure before the commit lands here, so
      // nothing was written (DR-023). A failed reload after it resolves (ADR 0125).
      if (e instanceof CsvImportError) setRefused(e.problems);
      else if (e instanceof CsvPlanChangedError) {
        setPlanChanged(true);
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
      <EntityImportPanel
        title={t.importPage.propertiesTitle}
        hint="properties.csv"
        templateFn={propertiesTemplate}
        templateFile="properties.csv"
        fileState={properties}
        onFile={handleProperties}
      />
      <EntityImportPanel
        title={t.importPage.valuationsTitle}
        hint="valuations.csv"
        templateFn={valuationsTemplate}
        templateFile="valuations.csv"
        fileState={valuations}
        onFile={handleValuations}
      />
      <EntityImportPanel
        title={t.importPage.rentsTitle}
        hint="rents.csv"
        templateFn={rentsTemplate}
        templateFile="rents.csv"
        fileState={rents}
        onFile={handleRents}
      />
      <EntityImportPanel
        title={t.importPage.mortgagesTitle}
        hint="mortgages.csv"
        templateFn={mortgagesTemplate}
        templateFile="mortgages.csv"
        fileState={mortgages}
        onFile={handleMortgages}
      />

      {hasAnyFile && (
        <Panel title={t.importPage.importTitle}>
          {!allValid && (
            <p className="error-text" style={{ marginBottom: "var(--s3)" }}>
              {t.importPage.fixErrors}
            </p>
          )}
          {previewFailure && (
            <div style={{ marginBottom: "var(--s3)" }}>
              <ErrorBanner
                message={t.importPage.previewFailed(
                  describeWriteError(t, toWriteError(previewFailure.error))
                    .message,
                )}
                onDismiss={() => setPreviewFailure(null)}
              />
            </div>
          )}
          {preview && preview.problems.length > 0 && (
            <RefusedTable problems={preview.problems} />
          )}
          {planOk && (
            <div style={{ marginBottom: "var(--s3)" }}>
              <ImportSummary items={preview.items} mode="preview" />
              {toWrite === 0 && (
                <p style={{ marginTop: "var(--s3)" }}>
                  {t.importPage.nothingToImport}
                </p>
              )}
            </div>
          )}
          {planChanged && (
            <div style={{ marginBottom: "var(--s3)" }}>
              <ErrorBanner
                message={t.importPage.planChanged}
                onDismiss={() => setPlanChanged(false)}
              />
            </div>
          )}
          <div className="row" style={{ gap: "var(--s3)" }}>
            <Button
              variant="primary"
              disabled={!canImport || confirming}
              onClick={() => void runImport(false)}
            >
              {importing
                ? t.importPage.importing
                : planOk && toWrite > 0
                  ? t.importPage.importScope(
                      toWrite,
                      counts.added,
                      counts.updated,
                    )
                  : t.importPage.importSelected}
            </Button>
          </div>
          {confirming && (
            <div className="confirm-row">
              <div className="confirm-row-content">
                {counts.updated > 0 && (
                  <span className="confirm-msg">
                    {t.importPage.confirmOverwriteMsg(counts.updated)}
                  </span>
                )}
                {counts.replacing > 0 && (
                  <span className="confirm-msg">
                    {t.importPage.confirmReplaceMsg(counts.replacing)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  disabled={importing}
                  onClick={() => void runImport(true)}
                >
                  {counts.updated > 0
                    ? t.importPage.confirmOverwrite(counts.updated)
                    : t.importPage.confirmReplace}
                </Button>
                <Button
                  size="sm"
                  disabled={importing}
                  onClick={() => setConfirming(false)}
                >
                  {t.common.cancel}
                </Button>
              </div>
            </div>
          )}
          {refused && <RefusedTable problems={refused} />}
        </Panel>
      )}

      {lastImport && (
        <Panel title={t.importPage.reportTitle}>
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
