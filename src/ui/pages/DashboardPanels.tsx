// The Dashboard's panels: the KPI band, the projection charts and the key-figures list.
// Each renders its slice of `dashboardView` (src/ui/model/dashboardView.ts); the series
// come from `dashboardSeries`. What stays here is markup: the tiles, the charts, the
// key-figure rows and `keepTail`, which keeps a label's closing parenthetical together.
import { KpiBand, KpiBandGroup, KpiTile } from "../components/Kpi";
import { Money, MoneyM } from "../components/figures";
import { Panel, StatList } from "../components/layout";
import { IrrValue, Pct } from "../components/rates";
import { ChartCard } from "../components/charts";
import { DscrTile, LtvTile, NetCashFlowTile } from "../components/kpiTiles";
import { fmtCzkM, fmtMultiple, fmtPct, noBreak } from "../../lib/format";
import type { ReactNode } from "react";
import {
  basisCaption,
  basisText,
  monthlyFlow,
  monthlyFlowHint,
} from "../model/dashboard";
import { dashboardSeries, resetMarkerHeading } from "../model/chartSeries";
import type {
  KpiListView,
  KpiStripView,
  ProjectionChartsView,
} from "../model/dashboardView";
import { undrawnPart } from "../model/debt";
import { useT } from "../hooks/useT";

/** The Dashboard's KPI band (ADR 0200, 0222): as of the chosen date, then at the
 *  horizon, each group captioned with what it is for. */
export function KpiStrip({ view }: { view: KpiStripView }) {
  const { s, basis, mode, isToday, lens, horizonYears, modeWord } = view;
  const t = useT();
  const d = t.dashboard;
  const undrawn = undrawnPart(s.totalUndrawnDebt);
  const irr = lens.leveredIrr;
  return (
    <KpiBand>
      <KpiBandGroup caption={basisCaption(t, basis)} cells={4}>
        <KpiTile
          compact
          delay={0}
          label={d.netWorth}
          testId="kpi-networth"
          value={<MoneyM value={s.totalEquity} />}
          foot={
            <>
              {/* The undrawn note sits right after the debt it adds to (ADR 0169);
                  amounts never break before their unit. */}
              {d.stripAssetsDebt(
                noBreak(fmtCzkM(s.totalReportedValue)),
                undrawn
                  ? `${noBreak(fmtCzkM(s.totalDebt))} (${t.common.undrawnDebt(noBreak(fmtCzkM(undrawn)))})`
                  : noBreak(fmtCzkM(s.totalDebt)),
              )}
              {mode === "real" && !isToday ? d.realTodayKc : ""}
            </>
          }
        />
        <NetCashFlowTile s={s} delay={24} />
        <LtvTile ltv={s.ltv} label={d.portfolioLtv} delay={48} />
        <DscrTile dscr={s.dscr} label={d.portfolioDscr} delay={72} />
      </KpiBandGroup>
      <KpiBandGroup
        caption={d.bandHorizonCaption(
          view.horizonEndYear,
          horizonYears,
          modeWord,
        )}
        cells={2}
      >
        <KpiTile
          compact
          delay={96}
          label={d.netWorth}
          value={<MoneyM value={lens.netWorth} />}
          foot={d.bandMultiple(
            lens.netWorthMultiple ? fmtMultiple(lens.netWorthMultiple) : "—",
          )}
        />
        <KpiTile
          compact
          delay={120}
          label={d.leveredIrr}
          value={<IrrValue irr={irr} dp={1} />}
          valueTitle={irr.rate ? fmtPct(irr.rate, 2) : undefined}
          foot={d.bandIrrFoot}
        />
      </KpiBandGroup>
    </KpiBand>
  );
}

/** One plot height for every Dashboard chart (ADR 0218 §2). */
const CHART_HEIGHT = 220;

/** The projection: six charts, two per row, under one heading that names the horizon
 *  and the lens once (ADR 0218 §2). The value chart leads and keeps the fixation-end
 *  markers (ADR 0210). */
export function ProjectionCharts({ view }: { view: ProjectionChartsView }) {
  const { mode, rows, eqChange, markers = [], horizonYears } = view;
  const t = useT();
  const d = t.dashboard;
  const {
    valueSeries,
    equitySeries,
    cashFlowSeries,
    rentSeries,
    noiSeries,
    ltvSeries,
  } = dashboardSeries(t, rows, eqChange);
  return (
    <section className="chart-grid-wrap projection-charts">
      <div className="charts-head">
        <h2>{d.projectionTitle(horizonYears)}</h2>
        <span className="hint">
          {mode === "real" ? d.realTerms : d.nominalKc}
        </span>
      </div>
      <div className="chart-grid pairs">
        <ChartCard
          title={d.chartValueVsDebtVsEquity}
          kind="czk"
          rows={rows}
          series={valueSeries}
          height={CHART_HEIGHT}
          markers={markers}
          markerHeading={resetMarkerHeading(t, mode)}
        />
        <ChartCard
          title={d.chartNetCashFlowByYear}
          sub={d.subNetCashFlow}
          kind="czk"
          rows={rows}
          chart="signed"
          series={cashFlowSeries}
          height={CHART_HEIGHT}
        />
        <ChartCard
          title={d.chartEquityChange}
          sub={d.subEquityChange}
          kind="czk"
          rows={eqChange}
          chart="stacked"
          series={equitySeries}
          totalLabel={d.seriesNetEquityChange}
          height={CHART_HEIGHT}
        />
        <ChartCard
          title={d.chartNoiVsDebtService}
          kind="czk"
          rows={rows}
          series={noiSeries}
          height={CHART_HEIGHT}
        />
        <ChartCard
          title={d.chartRentGrossVsEffective}
          kind="czk"
          rows={rows}
          series={rentSeries}
          height={CHART_HEIGHT}
        />
        <ChartCard
          title={d.chartLoanToValue}
          sub={d.subLtv}
          kind="pct"
          rows={rows}
          series={ltvSeries}
          height={CHART_HEIGHT}
        />
      </div>
    </section>
  );
}

/** A label whose closing parenthetical ("(Yrs 1–30)") never breaks inside: in a half-width
 *  column the line would otherwise break after the dash (ADR 0208 §3). */
function keepTail(label: string): ReactNode {
  const i = label.lastIndexOf(" (");
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)} <span className="kpi-tail">{label.slice(i + 1)}</span>
    </>
  );
}

export function KpiListPanel({ view }: { view: KpiListView }) {
  const { s, basis, kpis, lens, mode, horizonYears, cashInvested } = view;
  const t = useT();
  const d = t.dashboard;
  const real = mode === "real";
  const cagr = lens.cagr;
  const flow = monthlyFlow(s);
  // Only what the tiles do not show, in three groups (ADR 0208); net worth at the horizon,
  // the multiple and IRR are the tiles' alone.
  const groups: { title: string; rows: { k: ReactNode; v: ReactNode }[] }[] = [
    {
      title: d.kpiGroupReturns,
      rows: [
        { k: d.kpiNetWorthCagr, v: cagr ? <Pct value={cagr} dp={2} /> : "—" },
        { k: d.netYieldCap, v: <Pct value={s.netYield} dp={2} /> },
        { k: d.kpiGrossYield, v: <Pct value={s.grossYield} dp={2} /> },
        // A recorded nominal amount, labelled so in the real lens (ADR 0087, 0119 §9).
        ...(cashInvested
          ? [
              {
                k: real ? d.kpiCashInvestedNominal : d.kpiCashInvested,
                v: <Money value={cashInvested} parens={false} />,
              },
            ]
          : []),
      ],
    },
    {
      title: d.kpiGroupCashFlow,
      rows: [
        {
          k: d.kpiMonthlyInflow,
          v: <Money value={flow.inflow} parens={false} />,
        },
        {
          k: d.kpiMonthlyOutflow,
          v: <Money value={flow.outflow} parens={false} />,
        },
        {
          k: keepTail(d.kpiCumulativeCashToOwner(horizonYears)),
          v: <Money value={lens.cumulativeNetCashFlow} signed />,
        },
        {
          k: d.kpiFirstCfPositiveYear,
          v: kpis.firstCashFlowPositiveYear ?? "—",
        },
      ],
    },
    {
      title: d.kpiGroupDebt,
      rows: [
        {
          k: d.kpiWeightedAvgRate,
          v: <Pct value={s.weightedAvgRate} dp={2} />,
        },
        {
          // Σ principal repaid stays nominal; labelled so in the real lens (ADR 0087).
          k: keepTail(
            real
              ? d.kpiSumPrincipalRepaidNominal(horizonYears)
              : d.kpiSumPrincipalRepaid(horizonYears),
          ),
          v: <Money value={kpis.totalPrincipalRepaid} parens={false} />,
        },
        { k: d.kpiDebtFullyRepaid, v: kpis.debtFreeYear ?? "—" },
      ],
    },
  ];
  return (
    <Panel title={d.kpiTitle} hint={real ? d.kpiHintReal : d.kpiHintNominal}>
      <div className="kpi-box">
        <div className="kpi-groups">
          {groups.map((g) => (
            <section key={g.title} className="kpi-group">
              <h3 className="panel-subhead">{g.title}</h3>
              <StatList rows={g.rows} />
            </section>
          ))}
        </div>
      </div>
      {/* What the yields and monthly figures are for (ADR 0200 §3, ADR 0208 §4). */}
      <p className="panel-note">
        {d.kpiAsOfGroup(basisText(t, basis))} ·{" "}
        {monthlyFlowHint(t, basis, s.asOf)}
      </p>
    </Panel>
  );
}
