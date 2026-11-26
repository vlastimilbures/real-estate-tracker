import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Panel } from "../../components/layout";
import { RecordForm } from "../../components/forms";
import { RowActions, WriteRowAction } from "../../components/RowActions";
import { focusLost } from "../../focus";
import { sectionId } from "../../model/sectionNav";
import { fmtCzk, fmtPct } from "../../../lib/format";
import {
  holdingCostDraft,
  holdingCostFromForm,
  holdingCostSpecs,
  holdingCostsView,
} from "../../model/holdingCosts";
import type { HoldingCost, CostDefaults } from "../../../engine";
import type { MutationResult } from "../../../state/portfolioStore";
import { useT } from "../../hooks/useT";
import { newId } from "../../../lib/newId";

/** Holding costs (ADR 0207): a read view of the six costs, a blank field showing the
 *  portfolio default it falls back to; the pencil opens the form in place. */
export function HoldingCostsPanel({
  holding,
  propertyId,
  defaults,
  onSave,
  onSaved,
}: {
  holding: HoldingCost | undefined;
  propertyId: string;
  /** The portfolio defaults a blank field uses (Assumptions.defaults). */
  defaults: CostDefaults;
  onSave: (h: HoldingCost) => Promise<MutationResult>;
  onSaved: () => void;
}) {
  const t = useT();
  const d = t.propertyDetail;
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  // Focus follows the switch (ADR 0207 §3): into the form's first field on Edit, back to
  // the pencil on Cancel or Save; nothing on the first render. Focus that has moved on
  // elsewhere during a slow save stays where it is; the pencil's section scrolls to the
  // top, clear of the sticky top bar (its scroll-margin), as focusSection does.
  const switched = useRef(false);
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    const box = root.current;
    if (!box || !focusLost(box)) return;
    if (editing) {
      box.querySelector<HTMLElement>("form input, form select")?.focus();
      return;
    }
    pencil.current?.focus({ preventScroll: true });
    (document.getElementById(sectionId("holding")) ?? box).scrollIntoView?.({
      block: "start",
    });
  }, [editing]);
  const toggle = (next: boolean) => {
    switched.current = true;
    setEditing(next);
  };
  return (
    <div ref={root}>
      <Panel
        title={d.holdingCostsTitle}
        info={d.holdingCostsHint}
        action={
          editing ? undefined : (
            <RowActions>
              <WriteRowAction
                buttonRef={pencil}
                icon={Pencil}
                label={d.editHoldingCosts}
                onClick={() => toggle(true)}
              />
            </RowActions>
          )
        }
      >
        {!editing ? (
          <dl className="holding-view">
            {holdingCostsView(holding, defaults, t).map((r) => (
              <div key={r.label} className="holding-item">
                <dt>{r.label}</dt>
                <dd>
                  <span className="num">
                    {r.kind === "money" ? fmtCzk(r.value) : fmtPct(r.value)}
                  </span>
                  {r.isDefault && (
                    <>
                      {" "}
                      <span className="holding-default">
                        {d.holdingDefault}
                      </span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <RecordForm
            specs={holdingCostSpecs(t)}
            initial={holdingCostDraft(holding)}
            submitLabel={d.saveHoldingCosts}
            onSubmit={async (v) => {
              const res = await onSave(
                holdingCostFromForm(v, propertyId, holding, newId),
              );
              if (!res.ok) return res.error;
              onSaved();
              toggle(false);
              return undefined;
            }}
            onCancel={() => toggle(false)}
          />
        )}
      </Panel>
    </div>
  );
}
