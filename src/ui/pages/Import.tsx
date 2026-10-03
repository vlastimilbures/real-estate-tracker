import { useEffect, useMemo, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useEngine } from "../../state/useEngine";
import { AppShell } from "../components/AppShell";
import { Panel, Button, Toast, ErrorBanner } from "../components/primitives";
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
  const engine = useEngine();

  const [properties, setProperties] =
    useState<FileState<ParsedPropertyRow> | null>(null);
  const [valuations, setValuations] =
    useState<FileState<ParsedValuationRow> | null>(null);
  const [rents, setRents] = useState<FileState<ParsedRentRow> | null>(null);
  const [mortgages, setMortgages] =
    useState<FileState<ParsedMortgageRow> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [refused, setRefused] = useState<CsvImportProblem[] | null>(null);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [planChanged, setPlanChanged] = useState(false);
  const { toast, showToast } = useToast(2400);

  // FK-aware parsers: check child rows against known property names
  function knownNames(): Set<string> {
    const fromDb = new Set<string>(
      (engine?.snapshot.perProperty ?? []).map((p) => p.name),
    );
    const fromCsv = properties?.result.rows.map((r) => r.name) ?? [];
    return new Set([...fromDb, ...fromCsv]);
  }

  function handleProperties(name: string, bytes: Uint8Array) {
    const result = parseProperties(bytes);
    setProperties({ name, bytes, result });
    // Re-validate children FK with updated known names
    const newNames = new Set([
      ...(engine?.snapshot.perProperty ?? []).map((p) => p.name),
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
  // whenever the files or the stored data change.
  useEffect(() => {
    setConfirming(false);
    if (!hasAnyFile || !allValid) {
      setPreview(null);
      return;
    }
    let current = true;
    previewCsv(batch).then(
      (p) => {
        if (current) setPreview(p);
      },
      (e: unknown) => {
        logFailure("IMPORT", e);
        if (current) setPreview(null);
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
    // Updates overwrite stored records: ask first (ADR 0096).
    if (counts.updated > 0 && !confirmed) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setImporting(true);
    setImportError(null);
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
      // Import is one transaction: on any failure nothing was written (DR-023).
      if (e instanceof CsvImportError) setRefused(e.problems);
      else if (e instanceof CsvPlanChangedError) {
        setPlanChanged(true);
        setPreview(e.preview);
      } else {
        logFailure("IMPORT", e);
        // A constraint the CSV checks missed (a generated-id clash was one, now fixed: DR-137)
        // gets the translated wording, not SQLite's text.
        setImportError(
          t.importPage.importFailed(
            describeWriteError(t, toWriteError(e)).message,
          ),
        );
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
                <span className="confirm-msg">
                  {t.importPage.confirmOverwriteMsg(counts.updated)}
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={importing}
                  onClick={() => void runImport(true)}
                >
                  {t.importPage.confirmOverwrite(counts.updated)}
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
          {importError && (
            <div style={{ marginTop: "var(--s3)" }}>
              <ErrorBanner
                message={importError}
                onDismiss={() => setImportError(null)}
              />
            </div>
          )}
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

      {toast && <Toast message={toast} />}
    </AppShell>
  );
}
