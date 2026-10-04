// Property detail's "Data check" section (ADR 0118, #35): this property's stale, missing
// and defaulted inputs at the page's as-of date, each with a link to its fix on the page.
import type { Portfolio, Property, Rate } from "../../engine";
import { fmtDate } from "../../lib/format";
import { DataCheckList } from "../components/DataCheckList";
import { Panel } from "../components/primitives";
import { useT } from "../hooks/useT";
import { dataCheckItems, type DataCheckFix } from "../model/dataCheck";

export function PropertyDataCheckPanel({
  property,
  portfolio,
  asOf,
  resetRate,
  onFix,
}: {
  property: Property;
  portfolio: Portfolio;
  asOf: Date;
  resetRate: Rate;
  onFix: (fix: DataCheckFix) => void;
}) {
  const t = useT();
  const d = t.dataCheck;
  const { attention, defaults } = dataCheckItems([property], portfolio, asOf);
  return (
    <Panel title={d.title} hint={d.summary(attention.length, defaults.length)}>
      <DataCheckList
        attention={attention}
        defaults={defaults}
        resetRate={resetRate}
        showNames={false}
        onFix={(_, fix) => onFix(fix)}
      />
      <p className="panel-note">{d.asOfNote(fmtDate(asOf))}</p>
    </Panel>
  );
}
