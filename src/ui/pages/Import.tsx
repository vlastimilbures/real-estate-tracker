import { useState, Fragment } from "react";
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
  type CsvImportProblem,
  type CsvImportReport,
} from "../../state/csv";
import { logFailure } from "../../state/diagnostics";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import { importReportRows } from "../model/importReport";
import { toWriteError } from "../../state/writeError";
import { useToast } from "../hooks/useToast";

import {
  EntityImportPanel,
  RefusedTable,
  type FileState,
} from "./ImportPanels";

export function Import() {
  const t = useT();
  const importCsv = usePortfolioStore((s) => s.importCsv);
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
  const [importReport, setImportReport] = useState<CsvImportReport | null>(
    null,
  );
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

  const hasAnyFile = properties || valuations || rents || mortgages;
  const allValid = [properties, valuations, rents, mortgages].every(
    (f) => !f || f.result.errors.length === 0,
  );
  const canImport = hasAnyFile && allValid && !importing;

  async function runImport() {
    if (!canImport) return;
    setImporting(true);
    setImportError(null);
    setRefused(null);
    try {
      const report = await importCsv({
        properties: properties?.result.rows,
        valuations: valuations?.result.rows,
        rents: rents?.result.rows,
        mortgages: mortgages?.result.rows,
      });
      setImportReport(report);
      // Imported: clear the files so a second click cannot import them again (UX-038).
      setProperties(null);
      setValuations(null);
      setRents(null);
      setMortgages(null);
      showToast(t.importPage.importComplete);
    } catch (e) {
      // Import is one transaction: on any failure nothing was written (DR-023).
      if (e instanceof CsvImportError) setRefused(e.problems);
      else {
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
          <div className="row" style={{ gap: "var(--s3)" }}>
            <Button variant="primary" disabled={!canImport} onClick={runImport}>
              {importing ? t.importPage.importing : t.importPage.importSelected}
            </Button>
          </div>
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

      {importReport && (
        <Panel title={t.importPage.reportTitle}>
          <div className="statlist">
            {importReportRows(t, importReport.upserted).map((r) => (
              <Fragment key={r.label}>
                <div className="k">{r.label}</div>
                <div className="v">{r.value}</div>
              </Fragment>
            ))}
          </div>
        </Panel>
      )}

      {toast && <Toast message={toast} />}
    </AppShell>
  );
}
