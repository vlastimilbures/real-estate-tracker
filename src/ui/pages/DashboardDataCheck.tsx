// The Dashboard "Data check" panel (ADR 0118, ADR 0206, ADR 0223): stale, missing and
// defaulted inputs across the properties in view. The last section of the page: the counts
// in the head, then a block per list of findings grouped by problem, one chip per property
// linking to its fix. Open when something needs attention, the counts only otherwise; a
// manual Show / Hide holds for the app session.
import { Fragment, useId } from "react";
import { ChevronRight } from "lucide-react";
import { DisclosureButton } from "../components/Disclosure";
import type { Rate } from "../../engine";
import { useUiStore } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import {
  DataCheckBlock,
  DataCheckBlocks,
  DataCheckRow,
  DataCheckShell,
  type DataCheckKind,
} from "../components/DataCheckBlocks";
import {
  dataCheckGroups,
  fixLabel,
  type DataCheckFix,
  type DataCheckItem,
} from "../model/dataCheck";

/** The element the page title's review pill scrolls to (ADR 0218 §1). */
export const DATA_CHECK_ID = "dashboard-data-check";

type OnFix = (propertyId: string | null, fix: DataCheckFix) => void;

/** One block's rows: the problem once, then a chip per property (ADR 0206 §4). */
function GroupedBlock({
  items,
  kind,
  title,
  resetRate,
  onFix,
}: {
  items: DataCheckItem[];
  kind: DataCheckKind;
  title: string;
  resetRate: Rate;
  onFix: OnFix;
}) {
  const t = useT();
  const baseId = useId();
  return (
    <DataCheckBlock kind={kind} title={title}>
      {dataCheckGroups(t, items, resetRate).map((g, n) => {
        const problemId = `${baseId}-${n}`;
        return (
          <DataCheckRow
            key={problemId}
            kind={kind}
            text={g.headline}
            textId={problemId}
          >
            {g.chips.map((c, i) => {
              const chipId = `${problemId}-${i}`;
              const go = fixLabel(t, c.fix);
              return (
                <Fragment key={chipId}>
                  <button
                    type="button"
                    className="chip dc-chip"
                    aria-labelledby={`${chipId} ${problemId}`}
                    // A portfolio chip already reads its destination.
                    aria-describedby={
                      c.name === null ? undefined : `${chipId}-go`
                    }
                    title={go}
                    onClick={() => onFix(c.propertyId, c.fix)}
                  >
                    <span id={chipId}>
                      {c.name ?? go}
                      {c.detail && ` · ${c.detail}`}
                    </span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                  {/* The destination, as the chip's description. */}
                  {c.name !== null && (
                    <span id={`${chipId}-go`} hidden>
                      {go}
                    </span>
                  )}
                </Fragment>
              );
            })}
          </DataCheckRow>
        );
      })}
    </DataCheckBlock>
  );
}

export function DataCheckPanel({
  check,
  asOf,
  resetRate,
  onFix,
}: {
  /** The findings of the properties in view (`dashboardDataCheck`). */
  check: { attention: DataCheckItem[]; defaults: DataCheckItem[] };
  /** The snapshot's as-of date. */
  asOf: Date;
  resetRate: Rate;
  /** `propertyId` is null for a portfolio row. */
  onFix: OnFix;
}) {
  const t = useT();
  const d = t.dataCheck;
  const bodyId = useId();
  const choice = useUiStore((s) => s.dataCheckOpen);
  const setOpen = useUiStore((s) => s.setDataCheckOpen);
  const { attention, defaults } = check;
  const empty = attention.length + defaults.length === 0;
  const open = !empty && (choice ?? attention.length > 0);
  return (
    <div id={DATA_CHECK_ID} className="dc-anchor">
      <DataCheckShell
        check={check}
        asOf={asOf}
        action={
          !empty && (
            <span className="head-toggle">
              <DisclosureButton
                open={open}
                controls={bodyId}
                onToggle={() => setOpen(!open)}
              >
                {open ? d.hide : d.show}
              </DisclosureButton>
            </span>
          )
        }
      >
        <div id={bodyId} hidden={!open}>
          {open && (
            <DataCheckBlocks>
              {attention.length > 0 && (
                <GroupedBlock
                  items={attention}
                  kind="attention"
                  title={d.attentionTitle}
                  resetRate={resetRate}
                  onFix={onFix}
                />
              )}
              {defaults.length > 0 && (
                <GroupedBlock
                  items={defaults}
                  kind="defaults"
                  title={d.defaultsTitle}
                  resetRate={resetRate}
                  onFix={onFix}
                />
              )}
            </DataCheckBlocks>
          )}
        </div>
      </DataCheckShell>
    </div>
  );
}
