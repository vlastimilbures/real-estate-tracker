// The Dashboard "Financing & upcoming" panel (ADR 0103, ADR 0204). Presentation only:
// the figures, timeline, labels and note come from `financingView`
// (src/ui/model/financing.ts); a property's name opens it (`PropertyLink`).
import { FigureRow } from "../components/FigureRow";
import { useState, type ReactNode } from "react";
import { Table2 } from "lucide-react";
import {
  Button,
  Money,
  Panel,
  SegmentedToggle,
  StatList,
  TableWrap,
} from "../components/primitives";
import { Disclosure } from "../components/Disclosure";
import {
  DEFAULT_RESET_WINDOW,
  RESET_WINDOWS,
  TIMELINE_ROWS,
  financingView,
  timelineTable,
  type FinancingTimeline,
  type InterestSavedShown,
  type ResetWindow,
  type TimelineRow,
} from "../model/financing";
import type { Mode } from "../model/lens";
import type { FinancingExposure, Portfolio, PortfolioKPIs } from "../../engine";
import { fmtDate } from "../../lib/format";
import { useT } from "../hooks/useT";
import { PropertyLink } from "../components/PropertyLink";
import "../styles/loan-outlook.css";

const pct = (at: number) => `${at * 100}%`;

/** One loan (or property) of the timeline: name, decorative track, and the text that
 *  carries every date and amount (ADR 0204 §2, §7). */
function TimelineItem({ row }: { row: TimelineRow }) {
  const d = useT().dashboard;
  const f = row.fixation;
  return (
    <li className={f?.next ? "fx-row is-next" : "fx-row"}>
      <span className="fx-name">
        <PropertyLink id={row.propertyId} name={row.propertyName} />
      </span>
      <span className="fx-track" aria-hidden="true">
        {f && (
          <span
            className={f.beyond ? "fx-bar beyond" : "fx-bar"}
            style={{ width: pct(f.at) }}
          />
        )}
        {f && !f.beyond && (
          <span
            className="fx-mark fx-fixationEnd"
            style={{ left: pct(f.at) }}
          />
        )}
        {row.marks.map((m, i) => (
          <span
            key={i}
            className={`fx-mark fx-${m.kind}`}
            style={{ left: pct(m.at) }}
          />
        ))}
      </span>
      <span className="fx-text">
        {f ? (
          <span className="fx-line">
            {/* The diamond and the legend say it; assistive technology reads it. */}
            <span className="sr-only">{f.label} </span>
            {f.date} · <span className="fx-when">{f.timeLeft}</span>
            {f.amount && (
              <>
                {" · "}
                <Money value={f.amount} parens={false} />
              </>
            )}
            {f.next && (
              <>
                {" "}
                <span className="fx-next">{d.financingNextFlag}</span>
              </>
            )}
          </span>
        ) : (
          row.hasLoan && (
            <span className="fx-line">{d.financingNoFixationAhead}</span>
          )
        )}
        {row.marks.map((m, i) => (
          <span key={i} className="fx-line">
            {m.label} {m.date} · <span className="fx-when">{m.timeLeft}</span>
            {m.amount && (
              <>
                {" · "}
                <Money value={m.amount} parens={false} />
              </>
            )}
          </span>
        ))}
      </span>
    </li>
  );
}

/** The timeline of the window, or its table (ADR 0204 §2–§7). */
function FixationTimeline({
  tl,
  span,
  notes,
}: {
  tl: FinancingTimeline;
  span: ResetWindow;
  /** The panel's notes, on the line of the Table toggle. */
  notes: ReactNode;
}) {
  const t = useT();
  const d = t.dashboard;
  const [asTable, setAsTable] = useState(false);
  const name = d.financingTimeline(Number(span));
  // The rows under Show all are named by its button, not as a second timeline.
  const list = (rows: TimelineRow[], label?: string) => (
    <ul className="fx-rows" aria-label={label}>
      {rows.map((r) => (
        <TimelineItem key={r.propertyId} row={r} />
      ))}
    </ul>
  );
  const rest = tl.rows.slice(TIMELINE_ROWS);
  return (
    <div className="fx-timeline">
      {asTable ? (
        <TableWrap label={name}>
          <table className="data fx-table">
            <caption className="sr-only">{name}</caption>
            <thead>
              <tr>
                <th scope="col" className="left">
                  {d.financingColProperty}
                </th>
                <th scope="col" className="left">
                  {d.financingColEvent}
                </th>
                <th scope="col" className="left">
                  {d.financingColDate}
                </th>
                <th scope="col" className="left">
                  {d.financingColIn}
                </th>
                <th scope="col">{d.financingColDebt}</th>
              </tr>
            </thead>
            <tbody>
              {timelineTable(tl).map((r, i) => (
                <tr key={i}>
                  <td className="left">
                    <PropertyLink id={r.propertyId} name={r.propertyName} />
                  </td>
                  <td className="left">{r.event}</td>
                  <td className="left">{r.date}</td>
                  <td className="left">{r.timeLeft}</td>
                  <td>
                    {r.amount ? <Money value={r.amount} parens={false} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <>
          <div className="fx-axis" aria-hidden="true">
            <span className="fx-track">
              {tl.ticks.map((x) => (
                <span
                  key={x.label}
                  className={x.at > 0.95 ? "fx-tick end" : "fx-tick"}
                  style={{ left: pct(x.at) }}
                >
                  {x.label}
                </span>
              ))}
            </span>
            <span className="fx-legend">
              {tl.kinds.map((k) => (
                <span key={k.kind}>
                  <span className={`fx-mark fx-${k.kind}`} /> {k.label}
                </span>
              ))}
            </span>
          </div>
          {list(tl.rows.slice(0, TIMELINE_ROWS), name)}
          {rest.length > 0 && (
            <Disclosure label={d.financingShowAll(tl.rows.length)}>
              {list(rest)}
            </Disclosure>
          )}
        </>
      )}
      <div className="fx-foot">
        <div className="fx-notes">{notes}</div>
        <Button
          variant="ghost"
          size="sm"
          icon={Table2}
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          {t.charts.table}
        </Button>
      </div>
    </div>
  );
}

export function FinancingPanel(props: {
  fx: FinancingExposure;
  portfolio: Portfolio;
  kpis: PortfolioKPIs;
  mode: Mode;
  horizonYears: number;
}) {
  const t = useT();
  const d = t.dashboard;
  const [span, setSpan] = useState<ResetWindow>(DEFAULT_RESET_WINDOW);
  const {
    panel: m,
    timeline: tl,
    labels,
    ...v
  } = financingView(props, span, t);
  const next = m.nextReset;
  const savedValue = (x: InterestSavedShown) =>
    x === "n/a" ? (
      d.financingInterestSavedNa
    ) : (
      <Money value={x} parens={false} />
    );
  return (
    <Panel
      title={d.financingTitle}
      hint={d.financingHint(fmtDate(props.fx.asOf))}
      action={
        v.showWindow ? (
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
        <FigureRow
          figures={[
            {
              id: "next",
              label: d.financingNextReset,
              value: next ? next.date : d.financingNextResetNone,
              sub: next && (
                <PropertyLink id={next.propertyId} name={next.propertyName} />
              ),
            },
            {
              id: "balance",
              label: labels.balanceAtReset,
              value: next ? <Money value={next.balance} parens={false} /> : "—",
            },
            {
              id: "resetting",
              label: labels.resettingWithin,
              value: <Money value={m.resetting.amount} parens={false} />,
              sub: d.financingLoans(m.resetting.loans),
            },
            {
              id: "interest",
              label: labels.totalInterest,
              value: <Money value={m.totalInterest} parens={false} />,
            },
            ...(m.interestSaved
              ? [
                  {
                    id: "saved",
                    label: d.financingInterestSaved,
                    value: savedValue(m.interestSaved.total),
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <p className="panel-note">{d.financingNoLoans}</p>
      )}
      {m.interestSaved && (
        <Disclosure label={d.financingInterestSavedByProperty}>
          <StatList
            rows={m.interestSaved.properties.map((r) => ({
              k: <PropertyLink id={r.propertyId} name={r.propertyName} />,
              v: savedValue(r.amount),
            }))}
          />
        </Disclosure>
      )}
      {tl.rows.length > 0 ? (
        <FixationTimeline
          tl={tl}
          span={span}
          notes={<p className="panel-note">{v.note}</p>}
        />
      ) : (
        <p className="panel-note">{v.note}</p>
      )}
    </Panel>
  );
}
