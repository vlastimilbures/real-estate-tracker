// Read-only side-by-side compare for 2–3 scenarios (Base + picks): a key-figures
// table plus net-worth / net-cash-flow / LTV charts. Extracted from Scenarios.tsx;
// holds no finance logic — the engine re-runs via useScenarioComparison.
import { useId, useState } from "react";
import { useScenarioComparison } from "../../state/useEngine";
import { useUiStore } from "../../state/uiStore";
import { Panel, EmptyState, SegmentedToggle } from "../components/primitives";
import { GitCompare } from "lucide-react";
import { ChartCard, CzkLines, PctLines } from "../components/charts";
import { SERIES } from "../model/chartData";
import type { Scenario } from "../../engine";
import { useT } from "../hooks/useT";
import {
  compareBase,
  compareFootnote,
  compareHint,
  compareKpiRows,
  mergeCompareMetric,
  type CompareView,
} from "../model/compare";
import { at } from "../../lib/arrays";

// Up to four lines per chart (Base + 3 picks); cycles if more are somehow selected.
const PALETTE = [SERIES.petrol, SERIES.clay, SERIES.brass, SERIES.slate];

export function CompareView({ selected }: { selected: Scenario[] }) {
  const t = useT();
  const mode = useUiStore((s) => s.mode);
  const results = useScenarioComparison(selected);
  const footnoteId = useId();
  const [view, setView] = useState<CompareView>("values");
  if (!results || results.length === 0) {
    return (
      <Panel title={t.scenarios.compareTitle}>
        <EmptyState title={t.scenarios.nothingSelectedTitle} icon={GitCompare}>
          {t.scenarios.nothingSelectedBody}
        </EmptyState>
      </Panel>
    );
  }

  const colorOf = (i: number) => at(PALETTE, i % PALETTE.length);
  const series = results.map((r, i) => ({
    key: `s${i}`,
    name: r.name,
    color: colorOf(i),
  }));

  // Each scenario under the Nominal/Real lens, real by its own CPI (UX-055).
  const netWorthRows = mergeCompareMetric(results, mode, (y) => y.equity);
  const cashFlowRows = mergeCompareMetric(results, mode, (y) => y.netCashFlow);
  const ltvRows = mergeCompareMetric(results, mode, (y) => y.ltv);
  // Owner's loss next to the rebased returns of a crash at Today (ADR 0089).
  const footnote = compareFootnote(t, results);
  // Δ vs Base needs Base; without it the table shows values (ADR 0097).
  const base = compareBase(results);
  const shownView: CompareView = base ? view : "values";
  const lensSub =
    mode === "real" ? t.projections.realTerms : t.projections.nominalKc;

  return (
    <>
      <Panel
        title={t.scenarios.keyFiguresTitle}
        hint={compareHint(t, mode)}
        action={
          base && (
            <SegmentedToggle
              ariaLabel={t.scenarios.viewToggleLabel}
              options={[
                { value: "values", label: t.scenarios.viewValues },
                { value: "delta", label: t.scenarios.viewDeltaVsBase },
              ]}
              value={shownView}
              onChange={setView}
            />
          )
        }
      >
        {/* A real table for assistive technology: caption, scenario column headers,
            metric row headers (UX-081, DR-145). */}
        <table className="compare-table">
          <caption className="sr-only">{t.scenarios.keyFiguresTitle}</caption>
          <thead>
            <tr>
              {/* The metric column takes 1.4 shares, each scenario one (a plain
                  percentage: table columns ignore calc() with %). */}
              <td
                className="ct-head ct-metric"
                style={{
                  width: `${(140 / (1.4 + results.length)).toFixed(2)}%`,
                }}
              />
              {results.map((r, i) => (
                <th
                  scope="col"
                  className="ct-head"
                  key={r.id}
                  style={{ color: colorOf(i) }}
                >
                  {r.name}
                </th>
              ))}
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
        {footnote && (
          <p className="ct-footnote" id={footnoteId}>
            <span aria-hidden="true">* </span>
            {footnote}
          </p>
        )}
      </Panel>

      <div className="chart-grid">
        <ChartCard
          title={t.scenarios.chartNetWorth}
          sub={lensSub}
          kind="czk"
          rows={netWorthRows}
          series={series}
          legend
        >
          <CzkLines data={netWorthRows} series={series} />
        </ChartCard>
        <ChartCard
          title={t.scenarios.chartNetCashFlow}
          sub={lensSub}
          kind="czk"
          rows={cashFlowRows}
          series={series}
          legend
        >
          <CzkLines data={cashFlowRows} series={series} />
        </ChartCard>
        <ChartCard
          title={t.scenarios.chartLtv}
          sub={t.scenarios.subPct}
          kind="pct"
          rows={ltvRows}
          series={series}
          legend
        >
          <PctLines data={ltvRows} series={series} />
        </ChartCard>
      </div>
    </>
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
      <th scope="row" className="ct-metric">
        {label}
      </th>
      {cells.map((c, i) => (
        <td
          className="ct-cell"
          key={i}
          title={c.note}
          aria-describedby={c.describedBy}
        >
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
