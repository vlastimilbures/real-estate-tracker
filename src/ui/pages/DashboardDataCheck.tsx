// The Dashboard "Data check" panel (ADR 0118, #35): stale, missing and defaulted inputs
// across the properties in view. Open when something needs attention, collapsed otherwise;
// a manual Show / Hide holds for the app session.
import { useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Portfolio, Rate } from "../../engine";
import { fmtDate } from "../../lib/format";
import { useUiStore } from "../../state/uiStore";
import { DataCheckList } from "../components/DataCheckList";
import { Button, Panel } from "../components/primitives";
import { useT } from "../hooks/useT";
import { dataCheckItems, type DataCheckFix } from "../model/dataCheck";

export function DataCheckPanel({
  portfolio,
  asOf,
  resetRate,
  onFix,
}: {
  /** The properties in view (the Dashboard filter applied). */
  portfolio: Portfolio;
  /** The snapshot's as-of date. */
  asOf: Date;
  resetRate: Rate;
  onFix: (propertyId: string, fix: DataCheckFix) => void;
}) {
  const t = useT();
  const d = t.dataCheck;
  const bodyId = useId();
  const choice = useUiStore((s) => s.dataCheckOpen);
  const setOpen = useUiStore((s) => s.setDataCheckOpen);
  // Inactive properties are left out, as from the Dashboard's totals.
  const { attention, defaults } = dataCheckItems(
    portfolio.properties.filter((p) => p.active !== false),
    portfolio,
    asOf,
  );
  const empty = attention.length + defaults.length === 0;
  const open = !empty && (choice ?? attention.length > 0);
  return (
    <Panel
      title={d.title}
      hint={d.summary(attention.length, defaults.length)}
      action={
        !empty && (
          <span className="preset-toggle">
            <Button
              size="sm"
              variant="ghost"
              icon={open ? ChevronUp : ChevronDown}
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen(!open)}
            >
              {open ? d.hide : d.show}
            </Button>
          </span>
        )
      }
    >
      <div id={bodyId}>
        {open && (
          <DataCheckList
            attention={attention}
            defaults={defaults}
            resetRate={resetRate}
            showNames
            onFix={onFix}
          />
        )}
        {empty && <p className="panel-note">{d.attentionNone}</p>}
        <p className="panel-note">{d.asOfNote(fmtDate(asOf))}</p>
      </div>
    </Panel>
  );
}
