import { ChartCard } from "../../components/charts";
import type { ResetMarker } from "../../model/financing";
import { SERIES, type ChartRow } from "../../model/chartData";
import { valueSeries } from "../../model/chartSeries";
import type { AsOfBasis } from "../../model/dashboard";
import type { PropertySnapshot } from "../../../engine";
import { useT } from "../../hooks/useT";
import { NotOwnedPanel } from "./NotOwnedPanel";
import { SnapshotTiles } from "./SnapshotTiles";

/**
 * Snapshot KPI tiles (value / debt / equity / DSCR) + the two mini charts. A property not
 * owned yet on the date has no snapshot figures: a short purchase panel takes the tiles'
 * place, and the charts stay (ADR 0156).
 */
export function PropertySnapshotTiles({
  s,
  chartRows,
  modeWord,
  basis,
  purchaseDate,
  markers = [],
  markerHeading,
}: {
  s: PropertySnapshot;
  chartRows: ChartRow[];
  modeWord: string;
  /** What the tiles are for: current, a projection year or a date (ADR 0088, 0215). */
  basis: AsOfBasis;
  /** This property's upcoming fixation ends on its value chart (ADR 0210). */
  markers?: readonly ResetMarker[] | undefined;
  markerHeading?: string | undefined;
  /** Shown instead of the tiles while `s` is not owned. */
  purchaseDate?: Date | undefined;
}) {
  const t = useT();
  const pd = t.propertyDetail;
  const series = valueSeries(
    {
      value: pd.seriesValue,
      debt: pd.seriesDebt,
      committedDebt: pd.seriesCommittedDebt,
      equity: pd.seriesEquity,
    },
    chartRows,
  );
  const cashFlowSeries = [
    { key: "netCashFlow", name: pd.seriesNetCashFlow, color: SERIES.positive },
  ];
  return (
    <>
      {!s.owned && purchaseDate ? (
        <NotOwnedPanel purchaseDate={purchaseDate} />
      ) : (
        <SnapshotTiles s={s} basis={basis} />
      )}

      <div className="chart-grid">
        <ChartCard
          title={t.propertyDetail.chartValueVsDebtVsEquity}
          sub={t.propertyDetail.subMKcMode(modeWord)}
          kind="czk"
          rows={chartRows}
          series={series}
          markers={markers}
          markerHeading={markerHeading}
        />
        <ChartCard
          title={t.propertyDetail.chartNetCashFlowByYear}
          sub={t.propertyDetail.subMKcMode(modeWord)}
          kind="czk"
          rows={chartRows}
          chart="signed"
          series={cashFlowSeries}
        />
      </div>
    </>
  );
}
