import { useId } from "react";
import { Button } from "../../components/Button";
import { Money } from "../../components/figures";
import { Panel, StatList } from "../../components/layout";
import type { AcquisitionView } from "../../model/acquisition";
import { useT } from "../../hooks/useT";

/** The purchase's funding: sources and uses and the gap between them (ADR 0119 §9). */
export function AcquisitionPanel({
  view,
  onRecordFunding,
}: {
  view: AcquisitionView;
  /** Opens the property form at its Acquisition section (ADR 0209 §2), with the
   *  button that opened it. */
  onRecordFunding: (opener: HTMLElement) => void;
}) {
  const t = useT();
  const d = t.propertyDetail;
  const opensId = useId();
  // Nothing but the price known: one line and Record funding, not a table of "—"
  // (ADR 0209).
  if (view.emptyLine)
    return (
      <Panel title={d.acqTitle} hint={d.acqHint}>
        <div className="acq-empty">
          <p>{view.emptyLine}</p>
          <Button
            aria-describedby={opensId}
            onClick={(e) => onRecordFunding(e.currentTarget)}
          >
            {t.dataCheck.recordFunding}
          </Button>
          <span id={opensId} hidden>
            {d.acqRecordFundingOpens}
          </span>
        </div>
      </Panel>
    );
  return (
    <Panel title={d.acqTitle} hint={d.acqHint} info={d.acqNote}>
      <StatList
        rows={view.rows.map((r) => ({
          k: r.label,
          v: r.value ? <Money value={r.value} parens={false} /> : r.missing,
        }))}
      />
      {/* A standing note, not an alert: a gap never blocks (ADR 0119 §4). */}
      {view.warning && (
        <div className="banner warn" role="note">
          {view.warning}
        </div>
      )}
      {view.note && <p className="panel-note funding-note">{view.note}</p>}
    </Panel>
  );
}
