import { MetricLabel } from "../../components/MetricLabel";
import {
  KpiBand,
  KpiBandGroup,
  KpiTile,
  Money,
  Pct,
  Dscr,
} from "../../components/primitives";
import { fmtCzkM, noBreak } from "../../../lib/format";
import { undrawnPart } from "../../model/debt";
import { dscrBadge, ltvBadge } from "../../model/health";
import {
  basisCaption,
  monthlyFlow,
  type AsOfBasis,
} from "../../model/dashboard";
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
  const d = t.dashboard;
  const undrawn = undrawnPart(s.undrawnDebt);
  const flow = monthlyFlow(s);
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
        <KpiTile
          compact
          delay={72}
          label={<MetricLabel term="ltv">{pd.ltv}</MetricLabel>}
          value={<Pct value={s.ltv} />}
          health={ltvBadge(t, s.ltv)}
        />
        <KpiTile
          compact
          delay={96}
          label={<MetricLabel term="dscr">{pd.dscr}</MetricLabel>}
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
              {d.perYear}
            </>
          }
        />
      </KpiBandGroup>
    </KpiBand>
  );
}
