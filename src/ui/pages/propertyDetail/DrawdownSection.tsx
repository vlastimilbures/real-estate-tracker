import { useId } from "react";
import { Ban, Check, Clock } from "lucide-react";
import { InfoTip } from "../../components/InfoTip";
import { Money } from "../../components/figures";
import { TableWrap } from "../../components/layout";
import type { DrawdownRow, DrawdownView } from "../../model/propertyDetail";
import { useT } from "../../hooks/useT";

const DRAW_ICON: Record<DrawdownRow["status"], typeof Check> = {
  drawn: Check,
  ahead: Clock,
  cancelled: Ban,
};

/** A development loan's drawdown: a bar of drawn over total and each draw's status as
 *  an icon plus text (ADR 0167 §6). */
export function DrawdownSection({ dd }: { dd: DrawdownView }) {
  const t = useT();
  const d = t.propertyDetail;
  const headingId = useId();
  const pct = dd.percent;
  return (
    <section className="drawdown" aria-labelledby={headingId}>
      <div className="subhead-row">
        <h3 className="panel-subhead" id={headingId}>
          {dd.title}
        </h3>
        <InfoTip topic={dd.title}>{d.drawdownNote}</InfoTip>
      </div>
      <div
        className={`drawdown-bar${dd.full ? " full" : ""}`}
        role="progressbar"
        aria-labelledby={headingId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={dd.progress}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="drawdown-progress">
        {dd.full && <Check size={14} strokeWidth={2} aria-hidden="true" />}
        {dd.progress}
        {dd.completion && (
          <span className="drawdown-io">
            {" "}
            · {d.drawdownIoEnd(dd.completion)}
          </span>
        )}
      </p>
      <TableWrap label={`${dd.title} — ${d.drawdownTable}`}>
        <table className="data">
          <caption className="sr-only">{`${dd.title} — ${d.drawdownTable}`}</caption>
          <thead>
            <tr>
              <th scope="col" className="left">
                {d.eventDate}
              </th>
              <th scope="col" className="left">
                {d.colDraw}
              </th>
              <th scope="col">{d.eventAmount}</th>
              <th scope="col" className="left">
                {d.colStatus}
              </th>
            </tr>
          </thead>
          <tbody>
            {dd.rows.map((r, i) => {
              const Icon = DRAW_ICON[r.status];
              return (
                <tr key={i} className={`draw-${r.status}`}>
                  <td className="left">{r.date}</td>
                  <td className="left">{r.draw}</td>
                  <td>
                    <Money value={r.amount} parens={false} />
                  </td>
                  <td className="left">
                    <span className={`draw-status ${r.status}`}>
                      <Icon size={14} strokeWidth={2} aria-hidden="true" />
                      {r.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </section>
  );
}
