// The Dashboard "Financing & upcoming" panel (ADR 0103, #31). Presentation only: the
// figures come from `financingPanel` (src/ui/model/financing.ts).
import { useState } from "react";
import {
  Money,
  Panel,
  SegmentedToggle,
  StatList,
} from "../components/primitives";
import {
  DEFAULT_RESET_WINDOW,
  RESET_WINDOWS,
  financingLabels,
  financingPanel,
  type ResetWindow,
} from "../model/financing";
import type { Mode } from "../model/lens";
import type { FinancingExposure, Portfolio, PortfolioKPIs } from "../../engine";
import { fmtDate } from "../../lib/format";
import { useT } from "../hooks/useT";

function PropertyLink({
  id,
  name,
  onOpen,
}: {
  id: string;
  name: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="link-button cell-name"
      title={name}
      onClick={() => onOpen(id)}
    >
      {name}
    </button>
  );
}

export function FinancingPanel({
  fx,
  portfolio,
  kpis,
  mode,
  horizonYears,
  onOpenProperty,
}: {
  fx: FinancingExposure;
  portfolio: Portfolio;
  kpis: PortfolioKPIs;
  mode: Mode;
  horizonYears: number;
  onOpenProperty: (id: string) => void;
}) {
  const t = useT();
  const d = t.dashboard;
  const [span, setSpan] = useState<ResetWindow>(DEFAULT_RESET_WINDOW);
  const m = financingPanel(fx, portfolio, kpis, mode, span, t);
  const labels = financingLabels(t, mode, span, horizonYears);
  const next = m.nextReset;
  return (
    <Panel
      title={d.financingTitle}
      hint={d.financingHint(fmtDate(fx.asOf))}
      action={
        m.hasLoans ? (
          <SegmentedToggle
            options={RESET_WINDOWS.map((w) => ({
              value: w,
              label: d.financingWindowOption(Number(w)),
            }))}
            value={span}
            onChange={setSpan}
            ariaLabel={d.financingWindow}
          />
        ) : undefined
      }
    >
      {m.hasLoans ? (
        <StatList
          rows={[
            {
              k: d.financingNextReset,
              v: next ? (
                <>
                  {next.date} ·{" "}
                  <PropertyLink
                    id={next.propertyId}
                    name={next.propertyName}
                    onOpen={onOpenProperty}
                  />
                </>
              ) : (
                d.financingNextResetNone
              ),
            },
            {
              k: labels.balanceAtReset,
              v: next ? <Money value={next.balance} parens={false} /> : "—",
            },
            {
              k: labels.resettingWithin,
              v: (
                <>
                  <Money value={m.resetting.amount} parens={false} /> ·{" "}
                  {d.financingLoans(m.resetting.loans)}
                </>
              ),
            },
            {
              k: labels.totalInterest,
              v: <Money value={m.totalInterest} parens={false} />,
            },
            ...(m.interestSaved
              ? [
                  {
                    k: d.financingInterestSaved,
                    v: <Money value={m.interestSaved.total} parens={false} />,
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <p className="panel-note">{d.financingNoLoans}</p>
      )}
      {m.interestSaved && (
        <details>
          <summary>{d.financingInterestSavedByProperty}</summary>
          <StatList
            rows={m.interestSaved.properties.map((r) => ({
              k: (
                <PropertyLink
                  id={r.propertyId}
                  name={r.propertyName}
                  onOpen={onOpenProperty}
                />
              ),
              v: <Money value={r.amount} parens={false} />,
            }))}
          />
        </details>
      )}
      <h4 className="panel-subhead">{d.financingUpcoming}</h4>
      {m.events.length > 0 ? (
        <StatList
          rows={m.events.map((e) => ({
            k: (
              <>
                {e.date} ·{" "}
                <PropertyLink
                  id={e.propertyId}
                  name={e.propertyName}
                  onOpen={onOpenProperty}
                />
              </>
            ),
            v: (
              <>
                {e.label}
                {e.amount !== null && (
                  <>
                    {" · "}
                    <Money value={e.amount} parens={false} />
                  </>
                )}
              </>
            ),
          }))}
        />
      ) : (
        <p className="panel-note">{d.financingNoEvents}</p>
      )}
      {m.moreEvents > 0 && (
        <p className="panel-note">{d.financingMoreEvents(m.moreEvents)}</p>
      )}
      <p className="panel-note">{d.financingDisclaimer}</p>
    </Panel>
  );
}
