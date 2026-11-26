import { FigureRow, type Figure } from "../../components/FigureRow";
import { Money } from "../../components/figures";
import { Panel, TableWrap } from "../../components/layout";
import type { LoanOutlook } from "../../model/propertyDetail";
import { useT } from "../../hooks/useT";
import { DrawdownSection } from "./DrawdownSection";
import "../../styles/loan-outlook.css";

/**
 * The loan's modelled payoff, remaining term and the interest its prepayments save
 * (ADR 0116 §9), then each block's fixation end and balance at reset (ADR 0117).
 */
export function LoanSummary({ outlook }: { outlook: LoanOutlook }) {
  const t = useT();
  const d = t.propertyDetail;
  const { next, interestSaved } = outlook;
  // The figure row (ADR 0224 §2): every figure the list showed, after the next reset.
  const figures: Figure[] = [
    {
      id: "next",
      label: d.outlookStatus.nextReset,
      value: next ? next.date : d.outlookNextResetNone,
    },
    {
      id: "balance",
      label: d.colBalanceAtReset,
      value: next ? <Money value={next.balance} parens={false} /> : "—",
    },
    { id: "payoff", label: d.loanPayoff, value: outlook.payoff },
  ];
  if (outlook.remainingTerm)
    figures.push({
      id: "term",
      label: d.remainingTerm,
      value: outlook.remainingTerm,
    });
  if (interestSaved)
    figures.push({
      id: "saved",
      label: d.interestSaved,
      value:
        interestSaved === "n/a" ? (
          d.interestSavedNa
        ) : (
          <Money value={interestSaved} parens={false} />
        ),
    });
  return (
    <Panel
      title={d.loanSummaryTitle}
      hint={d.loanSummaryHint}
      info={d.loanSummaryNote}
    >
      <FigureRow figures={figures} />
      {outlook.drawdowns.map((dd) => (
        <DrawdownSection key={dd.blockId} dd={dd} />
      ))}
      <TableWrap label={d.outlookResetsTitle}>
        <table className="data">
          <caption className="sr-only">{d.outlookResetsTitle}</caption>
          <thead>
            <tr>
              <th scope="col" className="left">
                {d.colStart}
              </th>
              <th scope="col" className="left">
                {d.colFixationEnd}
              </th>
              <th scope="col">{d.colBalanceAtReset}</th>
              <th scope="col" className="left">
                {d.colStatus}
              </th>
            </tr>
          </thead>
          <tbody>
            {outlook.resets.map((r) => (
              <tr
                key={r.blockId}
                className={r.status === "nextReset" ? "is-milestone" : ""}
              >
                <td className="left">{r.start}</td>
                <td className="left">{r.fixationEnd}</td>
                <td>
                  {r.balance ? <Money value={r.balance} parens={false} /> : "—"}
                </td>
                <td className="left">{r.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Panel>
  );
}
