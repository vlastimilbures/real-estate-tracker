// The Dashboard "Data check" panel (ADR 0118, ADR 0206): stale, missing and defaulted
// inputs across the properties in view. The last section of the page: a summary row, then
// the findings grouped by problem, one chip per property linking to its fix. Open when
// something needs attention, the summary only otherwise; a manual Show / Hide holds for the
// app session.
import { Fragment, useId } from "react";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import { DisclosureButton } from "../components/Disclosure";
import type { Rate } from "../../engine";
import { fmtDate } from "../../lib/format";
import { useUiStore } from "../../state/uiStore";
import { Panel } from "../components/primitives";
import { useT } from "../hooks/useT";
import {
  dataCheckGroups,
  fixLabel,
  type DataCheckFix,
  type DataCheckItem,
} from "../model/dataCheck";

/** The element the page title's review pill scrolls to (ADR 0218 §1). */
export const DATA_CHECK_ID = "dashboard-data-check";

type OnFix = (propertyId: string | null, fix: DataCheckFix) => void;

/** One list's lines: the problem once, then a chip per property (ADR 0206 §4). */
function GroupedList({
  items,
  list,
  label,
  resetRate,
  onFix,
}: {
  items: DataCheckItem[];
  list: "attention" | "defaults";
  label: string;
  resetRate: Rate;
  onFix: OnFix;
}) {
  const t = useT();
  const baseId = useId();
  const Icon = list === "attention" ? AlertTriangle : Info;
  return (
    // An explicit list role: WebKit drops it from a list without bullets, and with it
    // the list's name.
    <ul role="list" className={`dc-lines ${list}`} aria-label={label}>
      {dataCheckGroups(t, items, resetRate).map((g, n) => {
        const problemId = `${baseId}-${n}`;
        return (
          <li key={problemId} className="dc-line">
            <Icon className="dc-icon" size={16} aria-hidden="true" />
            <div className="dc-body">
              <p className="dc-problem" id={problemId}>
                {g.headline}
              </p>
              <div className="dc-chips">
                {g.chips.map((c, i) => {
                  const chipId = `${problemId}-${i}`;
                  const go = fixLabel(t, c.fix);
                  return (
                    <Fragment key={chipId}>
                      <button
                        type="button"
                        className="dc-chip"
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
              </div>
            </div>
          </li>
        );
      })}
    </ul>
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
      <Panel
        title={d.title}
        hint={d.asOfNote(fmtDate(asOf))}
        action={
          !empty && (
            <span className="preset-toggle">
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
        <p className="dc-summary">
          <span className={attention.length > 0 ? "dc-count warn" : "dc-count"}>
            {attention.length > 0 && (
              <AlertTriangle size={16} aria-hidden="true" />
            )}
            {attention.length > 0
              ? d.needAttention(attention.length)
              : d.attentionNone}
          </span>
          {defaults.length > 0 && (
            <>
              {/* Two counts, two phrases for a screen reader too. */}
              <span className="sr-only"> · </span>
              <span className="dc-count">
                <Info size={16} aria-hidden="true" />
                {d.useDefaults(defaults.length)}
              </span>
            </>
          )}
        </p>
        <div id={bodyId}>
          {open && (
            <>
              {attention.length > 0 && (
                <GroupedList
                  items={attention}
                  list="attention"
                  label={d.attentionTitle}
                  resetRate={resetRate}
                  onFix={onFix}
                />
              )}
              {defaults.length > 0 && (
                <GroupedList
                  items={defaults}
                  list="defaults"
                  label={d.defaultsTitle}
                  resetRate={resetRate}
                  onFix={onFix}
                />
              )}
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
