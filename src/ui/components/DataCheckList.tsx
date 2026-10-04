// The Data check's two lists (ADR 0118): "Needs attention" first, then the quieter
// "Using portfolio defaults". Each row states the finding and its effect, then links to the
// place that fixes it. Text and targets come from src/ui/model/dataCheck.ts.
import type { Rate } from "../../engine";
import {
  findingFix,
  findingText,
  fixLabel,
  type DataCheckFix,
  type DataCheckItem,
} from "../model/dataCheck";
import { useT } from "../hooks/useT";
import { Button } from "./primitives";

export function DataCheckList({
  attention,
  defaults,
  resetRate,
  showNames,
  onFix,
}: {
  attention: DataCheckItem[];
  defaults: DataCheckItem[];
  resetRate: Rate;
  /** Prefix each row with its property's name (the Dashboard lists several). */
  showNames: boolean;
  onFix: (propertyId: string, fix: DataCheckFix) => void;
}) {
  const t = useT();
  const d = t.dataCheck;
  const rows = (items: DataCheckItem[], className: string) => (
    <ul className={className}>
      {items.map(({ propertyId, name, finding }) => {
        const fix = findingFix(finding);
        return (
          <li key={`${propertyId}-${finding.kind}`}>
            <span>
              {showNames && <strong>{name}: </strong>}
              {findingText(t, finding, resetRate)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onFix(propertyId, fix)}
            >
              {fixLabel(t, fix)}
            </Button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <>
      <h4 className="panel-subhead">{d.attentionTitle}</h4>
      {attention.length > 0 ? (
        rows(attention, "data-check-list")
      ) : (
        <p className="panel-note">{d.attentionNone}</p>
      )}
      {defaults.length > 0 && (
        <>
          <h4 className="panel-subhead">{d.defaultsTitle}</h4>
          {rows(defaults, "data-check-list quiet")}
        </>
      )}
    </>
  );
}
