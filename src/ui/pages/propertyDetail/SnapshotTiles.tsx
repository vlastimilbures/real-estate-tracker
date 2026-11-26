import { MetricLabel } from "../../components/MetricLabel";
import { KpiBand, KpiBandGroup, KpiTile } from "../../components/Kpi";
import { Money } from "../../components/figures";
import { DscrTile, LtvTile, NetCashFlowTile } from "../../components/kpiTiles";
import { fmtCzkM, noBreak } from "../../../lib/format";
import { undrawnPart } from "../../model/debt";
import { basisCaption, type AsOfBasis } from "../../model/dashboard";
import type { PropertySnapshot } from "../../../engine";
import { useT } from "../../hooks/useT";

/** The snapshot of an owned property: the Dashboard's KPI band, one group captioned with
 *  the basis (ADR 0215 §3, 0222 §4). */
export function SnapshotTiles({
  s,
  basis,
}: {
  s: PropertySnapshot;
  basis: AsOfBasis;
}) {
  const t = useT();
  const pd = t.propertyDetail;
  const undrawn = undrawnPart(s.undrawnDebt);
  return (
    <KpiBand>
      <KpiBandGroup caption={basisCaption(t, basis)} cells={6}>
        {/* ADR 0169: the value less the tranches not drawn yet, beside the drawn debt. */}
        <KpiTile
          compact
          delay={0}
          label={pd.marketValue}
          value={
            <Money value={s.reportedValue} parens={false} suffix={false} />
          }
          foot={undrawn && t.common.completedValue(fmtCzkM(s.value))}
        />
        <KpiTile
          compact
          delay={24}
          label={pd.debt}
          value={<Money value={s.debt} parens={false} suffix={false} />}
          foot={undrawn && t.common.undrawnDebt(noBreak(fmtCzkM(undrawn)))}
        />
        <KpiTile
          compact
          delay={48}
          label={pd.equity}
          value={<Money value={s.equity} parens={false} suffix={false} />}
        />
        <LtvTile
          ltv={s.ltv}
          label={<MetricLabel term="ltv">{pd.ltv}</MetricLabel>}
          delay={72}
        />
        <DscrTile
          dscr={s.dscr}
          label={<MetricLabel term="dscr">{pd.dscr}</MetricLabel>}
          delay={96}
        />
        <NetCashFlowTile s={s} delay={120} />
      </KpiBandGroup>
    </KpiBand>
  );
}
