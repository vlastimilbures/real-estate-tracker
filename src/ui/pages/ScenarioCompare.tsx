// Read-only side-by-side compare for 2–3 scenarios (Base + picks): a key-figures
// table plus net-worth / net-cash-flow / LTV charts. Extracted from Scenarios.tsx;
// holds no finance logic — the engine re-runs via useScenarioComparison.
import { useId, useState } from "react";
import { useScenarioComparison } from "../../state/useEngine";
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { SegmentedToggle } from "../components/Button";
import { ExportXlsxButton } from "../components/ExportXlsxButton";
import { Panel, EmptyState, TableWrap } from "../components/layout";
import { exportWorkbookXlsx } from "../exportXlsx";
import { compareWorkbook } from "../model/compareXlsx";
import { lensLabel } from "../model/tableContext";
import { GitCompare } from "lucide-react";
import { ChartCard, SMALL_CHART_HEIGHT } from "../components/charts";
import type { Scenario } from "../../engine";
import type { Mode } from "../model/lens";
import { useT } from "../hooks/useT";
import {
  compareBase,
  compareFootnote,
  compareHint,
  compareKpiRows,
  compareSeriesStyle,
  mergeCompareMetric,
  metricColumnWidth,
  ownRateNotes,
  type CompareResult,
  type CompareView,
} from "../model/compare";

export function ScenarioCompareView({
  selected,
  reachText,
}: {
  selected: Scenario[];
  /** Which loans a scenario's rate shock hits, by scenario id (ADR 0100). */
  reachText?: (id: string) => string | undefined;
}) {
  const t = useT();
  const mode = useUiStore((s) => s.mode);
  const results = useScenarioComparison(selected);
  const properties = usePortfolioStore((s) => s.portfolio?.properties);
  const footnoteId = useId();
  const [view, setView] = useState<CompareView>("values");
  // A pick the engine run left out breaks an engine rule (ADR 0123): name it, compare
  // the rest.
  const leftOut = results
    ? selected.filter((s) => !results.some((r) => r.id === s.id))
    : [];
  const notice = leftOut.length > 0 && (
    <div className="form-note" role="status">
      {leftOut.map((s) => (
        <p key={s.id}>{t.scenarios.notCompared(s.name)}</p>
      ))}
    </div>
  );
  if (!results || results.length === 0) {
    return (
      <Panel title={t.scenarios.compareTitle}>
        {notice || (
          <EmptyState
            title={t.scenarios.nothingSelectedTitle}
            icon={GitCompare}
            level={3}
          >
            {t.scenarios.nothingSelectedBody}
          </EmptyState>
        )}
      </Panel>
    );
  }

  // Owner's loss next to the rebased returns of a crash at Today (ADR 0089).
  const footnote = compareFootnote(t, results);
  // A scenario level a property's own rate overrides (ADR 0190); compared picks only.
  const ownRate = ownRateNotes(
    t,
    selected.filter((s) => !leftOut.includes(s)),
    properties ?? [],
  );
  // Δ vs Base needs Base; without it the table shows values (ADR 0097).
  const base = compareBase(results);
  const shownView: CompareView = base ? view : "values";

  return (
    <>
      <Panel
        title={t.scenarios.keyFiguresTitle}
        hint={compareHint(t, mode)}
        flush
        action={
          <span className="compare-actions">
            {base && (
              <SegmentedToggle
                ariaLabel={t.scenarios.viewToggleLabel}
                options={[
                  { value: "values", label: t.scenarios.viewValues },
                  { value: "delta", label: t.scenarios.viewDeltaVsBase },
                ]}
                value={shownView}
                onChange={setView}
              />
            )}
            {/* The whole compare, always as values (ADR 0108). */}
            <ExportXlsxButton
              onExport={() =>
                exportWorkbookXlsx(compareWorkbook(t, results, mode, ownRate))
              }
            />
          </span>
        }
      >
        {notice}
        {/* A real table for assistive technology: caption, scenario column headers,
            metric row headers. */}
        <TableWrap label={t.scenarios.keyFiguresTitle}>
          <table className="data compare-table">
            <caption className="sr-only">{t.scenarios.keyFiguresTitle}</caption>
            <thead>
              <tr>
                <td
                  className="sticky-col"
                  style={{ width: metricColumnWidth(results.length) }}
                />
                {results.map((r, i) => {
                  const reach = reachText?.(r.id);
                  return (
                    <th
                      scope="col"
                      key={r.id}
                      style={{ color: compareSeriesStyle(i).color }}
                      title={reach}
                    >
                      {r.name}
                      {reach && <span className="sr-only"> ({reach})</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {compareKpiRows(t, mode, base, shownView).map((row) => (
                <ComparisonRow
                  key={row.label}
                  label={row.label}
                  cells={results.map((r) => ({
                    text: row.fmt(r),
                    note: row.note?.(r),
                    describedBy: row.mark?.(r) ? footnoteId : undefined,
                  }))}
                />
              ))}
            </tbody>
          </table>
        </TableWrap>
        {footnote && (
          <p className="ct-footnote" id={footnoteId}>
            <span aria-hidden="true">* </span>
            {footnote}
          </p>
        )}
        {/* Scenario names may repeat, so the line text is no key. */}
        {ownRate.map((line, i) => (
          <p className="ct-footnote" key={i}>
            {line}
          </p>
        ))}
      </Panel>

      <CompareCharts results={results} mode={mode} />
    </>
  );
}

/** Net worth, net cash flow and LTV of each compared scenario. */
function CompareCharts({
  results,
  mode,
}: {
  results: CompareResult[];
  mode: Mode;
}) {
  const t = useT();
  // Colour and dash by position, so the lines read in greyscale too (ADR 0114).
  const series = results.map((r, i) => ({
    key: `s${i}`,
    name: r.name,
    ...compareSeriesStyle(i),
  }));
  // Each scenario under the Nominal/Real lens, real by its own CPI.
  const netWorthRows = mergeCompareMetric(results, mode, (y) => y.equity);
  const cashFlowRows = mergeCompareMetric(results, mode, (y) => y.netCashFlow, {
    flow: true,
  });
  const ltvRows = mergeCompareMetric(results, mode, (y) => y.ltv);
  const lensSub = lensLabel(t, mode);
  // Three in a row, two and one, or one per row by the charts' own width: never an empty
  // cell (ADR 0216 §1).
  return (
    <div className="chart-grid-wrap">
      <div className="chart-grid trio">
        <ChartCard
          title={t.scenarios.chartNetWorth}
          sub={lensSub}
          kind="czk"
          rows={netWorthRows}
          series={series}
          legend
          height={SMALL_CHART_HEIGHT}
        />
        <ChartCard
          title={t.scenarios.chartNetCashFlow}
          sub={lensSub}
          kind="czk"
          rows={cashFlowRows}
          series={series}
          legend
          height={SMALL_CHART_HEIGHT}
        />
        <ChartCard
          title={t.scenarios.chartLtv}
          sub={t.scenarios.subPct}
          kind="pct"
          rows={ltvRows}
          series={series}
          legend
          height={SMALL_CHART_HEIGHT}
        />
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  cells,
}: {
  label: string;
  cells: {
    text: string;
    note: string | undefined;
    /** The footnote id when the cell is marked (ADR 0089). */
    describedBy: string | undefined;
  }[];
}) {
  return (
    <tr>
      <th scope="row" className="sticky-col">
        {label}
      </th>
      {cells.map((c, i) => (
        <td key={i} title={c.note} aria-describedby={c.describedBy}>
          {c.text}
          {c.describedBy && (
            <sup className="ct-mark" aria-hidden="true">
              *
            </sup>
          )}
          {c.note && <span className="sr-only"> ({c.note})</span>}
        </td>
      ))}
    </tr>
  );
}
