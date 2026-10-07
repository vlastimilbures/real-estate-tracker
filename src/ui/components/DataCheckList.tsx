// The Data check's two lists (ADR 0118): "Needs attention" first, then the quieter
// "Using portfolio defaults". Each row states the finding and its effect, then links to the
// place that fixes it. Text and targets come from src/ui/model/dataCheck.ts.
import { useId } from "react";
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
  /** `propertyId` is null for a portfolio row (ADR 0148). */
  onFix: (propertyId: string | null, fix: DataCheckFix) => void;
}) {
  const t = useT();
  const d = t.dataCheck;
  // The row's text describes its fix button: on the Dashboard several buttons share a
  // name ("Go to Records"), and the description tells them apart.
  const baseId = useId();
  const rows = (
    items: DataCheckItem[],
    list: "attention" | "defaults",
    className: string,
  ) => (
    <ul className={className}>
      {items.map(({ propertyId, name, finding }, n) => {
        const fix = findingFix(finding);
        // One property can have several findings of a kind (ADR 0148): the list and the
        // index keep the id unique; the lists are rebuilt whole, never reordered in place.
        const textId = `${baseId}-${list}-${n}`;
        return (
          <li key={`${propertyId ?? ""}-${finding.kind}-${n}`}>
            <span id={textId}>
              {showNames && name !== null && <strong>{name}: </strong>}
              {findingText(t, finding, resetRate)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              aria-describedby={textId}
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
    <div className="data-check">
      <h4 className="panel-subhead">{d.attentionTitle}</h4>
      {attention.length > 0 ? (
        rows(attention, "attention", "data-check-list")
      ) : (
        <p className="panel-note">{d.attentionNone}</p>
      )}
      {defaults.length > 0 && (
        <>
          <h4 className="panel-subhead">{d.defaultsTitle}</h4>
          {rows(defaults, "defaults", "data-check-list quiet")}
        </>
      )}
    </div>
  );
}
