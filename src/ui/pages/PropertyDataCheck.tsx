// Property detail's "Data check" section (ADR 0118, #35; ADR 0223): this property's
// stale, missing and defaulted inputs at the page's as-of date, in the Dashboard's look —
// the counts in the head, a block per list — each row with a link to its fix on the page.
// The last section of the page.
import { useId } from "react";
import type { Rate } from "../../engine";
import { fmtDate } from "../../lib/format";
import {
  DataCheckBlock,
  DataCheckBlocks,
  DataCheckClear,
  DataCheckCounts,
  DataCheckRow,
  type DataCheckKind,
} from "../components/DataCheckBlocks";
import { Button, Panel } from "../components/primitives";
import { useT } from "../hooks/useT";
import {
  findingFix,
  findingText,
  fixLabel,
  type DataCheckFix,
  type DataCheckItem,
} from "../model/dataCheck";

export function PropertyDataCheckPanel({
  check,
  asOf,
  resetRate,
  onFix,
}: {
  /** This property's findings (`dataCheckItems`). */
  check: { attention: DataCheckItem[]; defaults: DataCheckItem[] };
  asOf: Date;
  resetRate: Rate;
  onFix: (fix: DataCheckFix) => void;
}) {
  const t = useT();
  const d = t.dataCheck;
  // The row's text describes its fix button: several buttons can share a name ("Go to
  // Records"), and the description tells them apart (#133).
  const baseId = useId();
  const { attention, defaults } = check;
  const empty = attention.length + defaults.length === 0;
  const block = (
    items: DataCheckItem[],
    kind: DataCheckKind,
    title: string,
  ) => (
    <DataCheckBlock kind={kind} title={title}>
      {items.map(({ propertyId, finding }, n) => {
        const fix = findingFix(finding);
        // One property can have several findings of a kind (ADR 0148): the list and the
        // index keep the id unique; the lists are rebuilt whole, never reordered in place.
        const textId = `${baseId}-${kind}-${n}`;
        return (
          <DataCheckRow
            key={`${propertyId ?? ""}-${finding.kind}-${n}`}
            kind={kind}
            text={findingText(t, finding, resetRate)}
            textId={textId}
          >
            <Button
              size="sm"
              variant="ghost"
              aria-describedby={textId}
              onClick={() => onFix(fix)}
            >
              {fixLabel(t, fix)}
            </Button>
          </DataCheckRow>
        );
      })}
    </DataCheckBlock>
  );
  return (
    <Panel
      title={d.title}
      badges={
        !empty && (
          <DataCheckCounts
            attention={attention.length}
            defaults={defaults.length}
          />
        )
      }
      info={d.asOfNote(fmtDate(asOf))}
    >
      {empty ? (
        <DataCheckClear />
      ) : (
        <DataCheckBlocks>
          {attention.length > 0 &&
            block(attention, "attention", d.attentionTitle)}
          {defaults.length > 0 && block(defaults, "defaults", d.defaultsTitle)}
        </DataCheckBlocks>
      )}
    </Panel>
  );
}
