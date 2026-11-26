import { Money } from "../../components/figures";
import { TableWrap } from "../../components/layout";
import { Pct } from "../../components/rates";
import { fmtDate } from "../../../lib/format";
import { amortizationExtras } from "../../model/propertyDetail";
import type { AmortizationRow } from "../../../engine";
import { useT } from "../../hooks/useT";

/** Monthly amortization table for the block driving the schedule. */
export function AmortizationTable({
  schedule,
}: {
  schedule: AmortizationRow[];
}) {
  const t = useT();
  const extras = amortizationExtras(schedule, t.propertyDetail);
  return (
    <TableWrap
      label={t.propertyDetail.amortizationTitle}
      className="amortization-wrap"
    >
      <table className="data">
        <caption className="sr-only">
          {t.propertyDetail.amortizationTitle}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="left">
              {t.propertyDetail.amColMonth}
            </th>
            <th scope="col" className="left">
              {t.propertyDetail.amColDate}
            </th>
            <th scope="col">{t.propertyDetail.amColRate}</th>
            <th scope="col">{t.propertyDetail.amColInstalment}</th>
            <th scope="col">{t.propertyDetail.amColInterest}</th>
            <th scope="col">{t.propertyDetail.amColPrincipal}</th>
            {extras.map(({ key, header }) => (
              <th key={key} scope="col">
                {header}
              </th>
            ))}
            <th scope="col">{t.propertyDetail.amColEndBalance}</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row, i) => {
            const prev = schedule[i - 1];
            const reset = prev !== undefined && !row.ratePa.equals(prev.ratePa);
            return (
              <tr key={row.month} className={reset ? "is-milestone" : ""}>
                <td className="left">{row.month}</td>
                <td className="left">
                  {row.dueDate ? fmtDate(row.dueDate) : "—"}
                </td>
                <td>
                  <Pct value={row.ratePa} dp={2} />
                </td>
                <td>
                  <Money value={row.instalment} parens={false} suffix={false} />
                </td>
                <td>
                  <Money value={row.interest} parens={false} suffix={false} />
                </td>
                <td>
                  <Money value={row.principal} parens={false} suffix={false} />
                </td>
                {extras.map(({ key }) => (
                  <td key={key}>
                    <Money value={row[key]} parens={false} suffix={false} />
                  </td>
                ))}
                <td>
                  <Money value={row.endBalance} parens={false} suffix={false} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
