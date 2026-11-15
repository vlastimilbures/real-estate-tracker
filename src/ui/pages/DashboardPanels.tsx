// Sub-components pulled out of Dashboard.tsx to shrink its render tree. Pure
// presentation — no logic beyond what Dashboard.tsx already computed.
import {
  KpiTile,
  Panel,
  Money,
  MoneyM,
  IrrValue,
  Pct,
  Dscr,
  StatList,
} from "../components/primitives";
import { ChartCard } from "../components/charts";
import {
  SERIES,
  COMMITTED_DASH,
  hasPurchases,
  hasUndrawn,
  type ChartRow,
  type EquityChangeRow,
} from "../model/chartData";
import { fmtCzkM, fmtMultiple, fmtPct, noBreak } from "../../lib/format";
import type { ReactNode } from "react";
import { dscrBadge, ltvBadge } from "../model/health";
import {
  basisText,
  monthlyFlow,
  monthlyFlowHint,
  type AsOfBasis,
} from "../model/dashboard";
import type { LeveredIrr } from "../model/irr";
import { lensKpis } from "../model/lensKpis";
import { undrawnPart } from "../model/debt";
import type { PortfolioKPIs, PortfolioSnapshot } from "../../engine";
import type { Decimal } from "../../lib/money";
import type { Mode } from "../../state/uiStore";
import { useT } from "../hooks/useT";

/** The Dashboard's KPI strip (ADR 0200): six compact tiles; the basis is named once, in
 *  the net cash flow foot. */
export function KpiStrip({
  s,
  basis,
  mode,
  isToday,
  horizon,
  horizonYears,
  horizonEndYear,
  netWorthMultiple,
  modeWord,
  irr,
}: {
  s: PortfolioSnapshot;
  /** What the tiles are for: current, a projection year or a date (ADR 0088). */
  basis: AsOfBasis;
  mode: Mode;
  isToday: boolean;
  horizon: Decimal;
  horizonYears: number;
  /** Calendar year of the last projection row (ADR 0088). */
  horizonEndYear: number;
  netWorthMultiple: Decimal | null;
  modeWord: string;
  irr: LeveredIrr;
}) {
  const t = useT();
  const d = t.dashboard;
  const undrawn = undrawnPart(s.totalUndrawnDebt);
  const flow = monthlyFlow(s);
  return (
    <div className="kpi-strip-wrap">
      <div className="kpi-strip">
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
        <KpiTile
          compact
          delay={24}
          label={d.stripInYear(horizonEndYear)}
          value={<MoneyM value={horizon} />}
          foot={d.stripHorizonFoot(
            netWorthMultiple ? fmtMultiple(netWorthMultiple) : "—",
            horizonYears,
            modeWord,
          )}
        />
        <KpiTile
          compact
          delay={48}
          label={d.leveredIrr}
          value={<IrrValue irr={irr} dp={1} />}
          valueTitle={irr.rate ? fmtPct(irr.rate, 2) : undefined}
          foot={d.irrFoot(horizonYears, modeWord)}
        />
        <KpiTile
          compact
          delay={72}
          label={d.portfolioLtv}
          value={<Pct value={s.ltv} dp={1} />}
          health={ltvBadge(t, s.ltv)}
        />
        <KpiTile
          compact
          delay={96}
          label={d.portfolioDscr}
          value={s.dscr ? <Dscr value={s.dscr} /> : "—"}
          health={dscrBadge(t, s.dscr)}
        />
        <KpiTile
          compact
          delay={120}
          label={d.stripNetCashFlow}
          value={
            <>
              <Money value={flow.net} signed />
              <span className="unit">{d.perMonth}</span>
            </>
          }
          foot={
            <>
              <Money value={s.netCashFlow} />
              {d.perYearBasis(basisText(t, basis))}
            </>
          }
        />
      </div>
    </div>
  );
}

/** The series of the Dashboard's projection charts (the rows carry the lens). */
function useProjectionSeries(rows: ChartRow[], eqChange: EquityChangeRow[]) {
  const t = useT();
  const d = t.dashboard;
  const valueSeries = [
    { key: "value", name: d.seriesValue, color: SERIES.petrol },
    { key: "balance", name: d.seriesDebt, color: SERIES.clay },
    // ADR 0169: dashed while a development loan has tranches ahead.
    ...(hasUndrawn(rows)
      ? [
          {
            key: "committedDebt",
            name: d.seriesCommittedDebt,
            color: SERIES.clay,
            dash: COMMITTED_DASH,
          },
        ]
      : []),
    { key: "equity", name: d.seriesEquity, color: SERIES.brass },
  ];
  const equitySeries = [
    { key: "appreciation", name: d.seriesAppreciation, color: SERIES.petrol },
    // ADR 0165: only when a purchase falls inside the projection.
    ...(hasPurchases(eqChange)
      ? [{ key: "purchases", name: d.seriesPurchases, color: SERIES.slate }]
      : []),
    { key: "paydown", name: d.seriesDebtPaydown, color: SERIES.brass },
    { key: "drawdown", name: d.seriesDebtDrawn, color: SERIES.clay },
  ];
  const cashFlowSeries = [
    { key: "netCashFlow", name: d.seriesNetCashFlow, color: SERIES.positive },
  ];
  const rentSeries = [
    { key: "grossRent", name: d.seriesGross, color: SERIES.slate },
    { key: "effectiveRent", name: d.seriesEffective, color: SERIES.petrol },
  ];
  const noiSeries = [
    { key: "noi", name: d.seriesNoi, color: SERIES.petrol },
    { key: "debtService", name: d.seriesDebtService, color: SERIES.clay },
  ];
  const ltvSeries = [{ key: "ltv", name: d.seriesLtv, color: SERIES.slate }];
  return {
    valueSeries,
    equitySeries,
    cashFlowSeries,
    rentSeries,
    noiSeries,
    ltvSeries,
  };
}

/** Plot heights on the Dashboard (ADR 0202): the hero chart and the small multiples. */
const HERO_HEIGHT = 280;
const SMALL_HEIGHT = 180;

/** The projection itself, first after the KPI strip: value vs debt vs equity, full
 *  width, under a panel-style heading with the lens (ADR 0202 §2). */
export function ProjectionHero({
  mode,
  rows,
  horizonYears,
}: {
  mode: Mode;
  rows: ChartRow[];
  horizonYears: number;
}) {
  const t = useT();
  const d = t.dashboard;
  const { valueSeries } = useProjectionSeries(rows, []);
  return (
    <section className="chart-hero">
      <div className="chart-hero-head">
        <h2>{d.projectionTitle(horizonYears)}</h2>
        <span className="hint">
          {mode === "real" ? d.realTerms : d.nominalKc}
        </span>
      </div>
      <ChartCard
        title={d.chartValueVsDebtVsEquity}
        kind="czk"
        rows={rows}
        series={valueSeries}
        height={HERO_HEIGHT}
      />
    </section>
  );
}

/** The five other projection charts as small multiples, three then two per row
 *  (ADR 0202 §3), under a small heading with the lens (§4). */
export function MoreCharts({
  mode,
  rows,
  eqChange,
  horizonYears,
}: {
  mode: Mode;
  rows: ChartRow[];
  eqChange: EquityChangeRow[];
  horizonYears: number;
}) {
  const t = useT();
  const d = t.dashboard;
  const { equitySeries, cashFlowSeries, rentSeries, noiSeries, ltvSeries } =
    useProjectionSeries(rows, eqChange);
  return (
    <section className="chart-grid-wrap">
      {/* Far below the hero: these charts name their horizon and lens again. */}
      <div className="chart-hero-head charts-head">
        <h2>{d.moreCharts(horizonYears)}</h2>
        <span className="hint">
          {mode === "real" ? d.realTerms : d.nominalKc}
        </span>
      </div>
      <div className="chart-grid small">
        <ChartCard
          title={d.chartNetCashFlowByYear}
          sub={d.subNetCashFlow}
          kind="czk"
          rows={rows}
          chart="signed"
          series={cashFlowSeries}
          height={SMALL_HEIGHT}
        />
        <ChartCard
          title={d.chartEquityChange}
          sub={d.subEquityChange}
          kind="czk"
          rows={eqChange}
          chart="stacked"
          series={equitySeries}
          totalLabel={d.seriesNetEquityChange}
          height={SMALL_HEIGHT}
        />
        <ChartCard
          title={d.chartNoiVsDebtService}
          kind="czk"
          rows={rows}
          series={noiSeries}
          height={SMALL_HEIGHT}
        />
        <ChartCard
          title={d.chartRentGrossVsEffective}
          kind="czk"
          rows={rows}
          series={rentSeries}
          height={SMALL_HEIGHT}
        />
        <ChartCard
          title={d.chartLoanToValue}
          sub={d.subLtv}
          kind="pct"
          rows={rows}
          series={ltvSeries}
          height={SMALL_HEIGHT}
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

export function KpiListPanel({
  s,
  basis,
  kpis,
  mode,
  horizonYears,
  cashInvested,
}: {
  s: PortfolioSnapshot;
  /** What the as-of figures (yields, monthly flows) are for (ADR 0200 §3). */
  basis: AsOfBasis;
  kpis: PortfolioKPIs;
  mode: Mode;
  horizonYears: number;
  /** Σ own cash, null unless every property has it (ADR 0119 §9). */
  cashInvested: Decimal | null;
}) {
  const t = useT();
  const d = t.dashboard;
  const real = mode === "real";
  const lens = lensKpis(kpis, mode);
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
