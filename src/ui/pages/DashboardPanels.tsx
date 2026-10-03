// Sub-components pulled out of Dashboard.tsx to shrink its render tree. Pure
// presentation — no logic beyond what Dashboard.tsx already computed.
import {
  KpiTile,
  Panel,
  Money,
  IrrValue,
  Pct,
  Mult,
  Dscr,
  StatList,
} from "../components/primitives";
import {
  ChartCard,
  CzkLines,
  StackedCzkBars,
  SignedBars,
  PctLine,
} from "../components/charts";
import {
  SERIES,
  type ChartRow,
  type EquityChangeRow,
} from "../model/chartData";
import { fmtCzkM, fmtMultiple, fmtPct } from "../../lib/format";
import { dscrBand, dscrBandWord, ltvBand, ltvBandWord } from "../model/health";
import type { MonthlyFlow } from "../model/dashboard";
import type { LeveredIrr } from "../model/irr";
import { lensKpis } from "../model/lensKpis";
import type { PortfolioKPIs, PortfolioSnapshot } from "../../engine";
import type { Decimal } from "../../lib/money";
import type { Mode } from "../../state/uiStore";
import { useT } from "../hooks/useT";

export function HeroTiles({
  s,
  mode,
  isToday,
  horizon,
  horizonYears,
  netWorthMultiple,
  modeWord,
  irr,
}: {
  s: PortfolioSnapshot;
  mode: Mode;
  isToday: boolean;
  horizon: Decimal;
  horizonYears: number;
  netWorthMultiple: Decimal;
  modeWord: string;
  irr: LeveredIrr;
}) {
  const t = useT();
  return (
    <div className="tiles">
      <KpiTile
        hero
        delay={0}
        label={t.dashboard.netWorth}
        testId="kpi-networth"
        // Hero: full CZK digits (no suffix) — visual anchor; siblings use M Kč
        value={<Money value={s.totalEquity} parens={false} suffix={false} />}
        foot={
          <>
            {t.dashboard.assetsDebtEquity(
              fmtCzkM(s.totalValue),
              fmtCzkM(s.totalDebt),
            )}
            {mode === "real" && !isToday ? t.dashboard.realTodayKc : ""}
          </>
        }
      />
      <KpiTile
        delay={24}
        label={t.dashboard.netWorthInYears(horizonYears)}
        value={fmtCzkM(horizon)}
        foot={t.dashboard.multipleFromStartMode(
          fmtMultiple(netWorthMultiple),
          modeWord,
        )}
      />
      <KpiTile
        delay={48}
        label={t.dashboard.leveredIrr}
        value={<IrrValue irr={irr} dp={1} />}
        foot={t.dashboard.irrFoot(horizonYears, modeWord)}
      />
    </div>
  );
}

export function RiskTiles({ s }: { s: PortfolioSnapshot }) {
  const t = useT();
  return (
    <div className="tiles">
      <KpiTile
        delay={0}
        label={t.dashboard.portfolioLtv}
        value={<Pct value={s.ltv} dp={1} />}
        badge={{
          band: ltvBand(s.ltv),
          text: ltvBandWord(t, s.ltv),
        }}
        foot={t.dashboard.debtOverValue}
      />
      <KpiTile
        delay={24}
        label={t.dashboard.portfolioDscr}
        value={s.dscr ? <Dscr value={s.dscr} /> : "—"}
        badge={{
          band: dscrBand(s.dscr),
          text: dscrBandWord(t, s.dscr) ?? t.dashboard.badgeShortfall,
        }}
        foot={t.dashboard.noiOverDebtService}
      />
      <KpiTile
        delay={48}
        label={t.dashboard.netYieldCap}
        value={<Pct value={s.netYield} dp={2} />}
        foot={t.dashboard.grossYieldFoot(fmtPct(s.grossYield, 2))}
      />
      <KpiTile
        delay={72}
        label={t.dashboard.annualNetCashFlow}
        value={<Money value={s.netCashFlow} signed />}
        foot={t.dashboard.noiMinusDebtService}
      />
    </div>
  );
}

export function MonthlyFlowPanel({ flow }: { flow: MonthlyFlow }) {
  const t = useT();
  return (
    <Panel
      title={t.dashboard.currentMonthlyCashFlow}
      hint={t.dashboard.monthlyHint}
    >
      <div className="flow-bars">
        <div className="flow in">
          <div className="flabel">{t.dashboard.inflowLabel}</div>
          <div className="famount tone-positive">
            <Money value={flow.inflow} parens={false} />
          </div>
          <div className="fbar" />
        </div>
        <div className="flow out">
          <div className="flabel">{t.dashboard.outflowLabel}</div>
          <div className="famount tone-negative">
            <Money value={flow.outflow} parens={false} />
          </div>
          <div className="fbar" />
        </div>
        <div className="flow net">
          <div className="flabel">{t.dashboard.netCashFlowBaseline}</div>
          <div className="famount">
            <Money value={flow.net} signed />
          </div>
          <div className="fbar" />
        </div>
      </div>
    </Panel>
  );
}

export function TrajectoryCharts({
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
  const valueSeries = [
    { key: "value", name: d.seriesValue, color: SERIES.petrol },
    { key: "balance", name: d.seriesDebt, color: SERIES.clay },
    { key: "equity", name: d.seriesEquity, color: SERIES.brass },
  ];
  const equitySeries = [
    { key: "appreciation", name: d.seriesAppreciation, color: SERIES.petrol },
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
  return (
    <>
      <div className="section-head">
        <h2>{d.trajectory(horizonYears)}</h2>
        <span className="page-sub">
          {mode === "real" ? d.realTerms : d.nominalKc}
        </span>
      </div>
      <div className="chart-grid">
        <ChartCard
          title={d.chartValueVsDebtVsEquity}
          kind="czk"
          rows={rows}
          series={valueSeries}
        >
          <CzkLines data={rows} series={valueSeries} />
        </ChartCard>

        <ChartCard
          title={d.chartEquityChange}
          sub={d.subEquityChange}
          kind="czk"
          rows={eqChange}
          series={equitySeries}
        >
          <StackedCzkBars
            data={eqChange}
            totalLabel={d.seriesNetEquityChange}
            series={equitySeries}
          />
        </ChartCard>

        <ChartCard
          title={d.chartNetCashFlowByYear}
          sub={d.subNetCashFlow}
          kind="czk"
          rows={rows}
          series={cashFlowSeries}
        >
          <SignedBars
            data={rows}
            dataKey="netCashFlow"
            name={d.seriesNetCashFlow}
          />
        </ChartCard>

        <ChartCard
          title={d.chartRentGrossVsEffective}
          kind="czk"
          rows={rows}
          series={rentSeries}
        >
          <CzkLines data={rows} series={rentSeries} />
        </ChartCard>

        <ChartCard
          title={d.chartNoiVsDebtService}
          kind="czk"
          rows={rows}
          series={noiSeries}
        >
          <CzkLines data={rows} series={noiSeries} />
        </ChartCard>

        <ChartCard
          title={d.chartLoanToValue}
          sub={d.subLtv}
          kind="pct"
          rows={rows}
          series={ltvSeries}
        >
          <PctLine data={rows} dataKey="ltv" name={d.seriesLtv} />
        </ChartCard>
      </div>
    </>
  );
}

export function KpiListPanel({
  s,
  kpis,
  mode,
  horizon,
  horizonYears,
  irr,
}: {
  s: PortfolioSnapshot;
  kpis: PortfolioKPIs;
  mode: Mode;
  horizon: Decimal;
  horizonYears: number;
  irr: LeveredIrr;
}) {
  const t = useT();
  const real = mode === "real";
  const cagr = real ? kpis.cagrReal : kpis.cagrNominal;
  const lens = lensKpis(kpis, mode);
  return (
    <Panel
      title={t.dashboard.kpiTitle}
      hint={real ? t.dashboard.kpiHintReal : t.dashboard.kpiHintNominal}
    >
      <StatList
        rows={[
          {
            k: t.dashboard.kpiNetWorthAtHorizon,
            v: <Money value={horizon} parens={false} />,
          },
          {
            k: t.dashboard.kpiNetWorthMultiple,
            v: <Mult value={lens.netWorthMultiple} />,
          },
          {
            k: t.dashboard.kpiNetWorthCagr,
            v: cagr ? <Pct value={cagr} dp={2} /> : "—",
          },
          {
            k: t.dashboard.kpiLeveredIrr,
            v: <IrrValue irr={irr} dp={2} />,
          },
          {
            k: t.dashboard.kpiCumulativeNetCashFlow(horizonYears),
            v: <Money value={lens.cumulativeNetCashFlow} signed />,
          },
          {
            k: t.dashboard.kpiFirstCfPositiveYear,
            v: kpis.firstCashFlowPositiveYear ?? "—",
          },
          { k: t.dashboard.kpiDebtFullyRepaid, v: kpis.debtFreeYear ?? "—" },
          {
            // Σ principal repaid stays nominal; labelled so in the real lens (ADR 0087).
            k: real
              ? t.dashboard.kpiSumPrincipalRepaidNominal(horizonYears)
              : t.dashboard.kpiSumPrincipalRepaid(horizonYears),
            v: <Money value={kpis.totalPrincipalRepaid} parens={false} />,
          },
          {
            k: t.dashboard.kpiWeightedAvgRate,
            v: <Pct value={s.weightedAvgRate} dp={2} />,
          },
        ]}
      />
    </Panel>
  );
}
