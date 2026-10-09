// Dense year-by-year grid, shared by the Projections screen and Property detail.
// Renders SeriesRow[] (already lensed Nominal/Real). Money compact (no "Kč" suffix).
import { MetricLabel } from "./MetricLabel";
import { Money, Pct, TableWrap } from "./primitives";
import { fmtDscr } from "../../lib/format";
import type { Decimal } from "../../lib/money";
import {
  periodLabelLocalized,
  projectionExtras,
  yearLabel,
  showPeriodColumn,
  type SeriesRow,
} from "../model/projection";
import { useT } from "../hooks/useT";

export function ProjectionGrid({
  rows,
  baseDate,
}: {
  rows: SeriesRow[];
  baseDate: Date;
}) {
  const t = useT();
  const last = rows.length - 1;
  // Year 1's fiscal span starts at edate(baseDate, 1); if that month is January
  // the spans equal calendar years and the Period column just restates "Year".
  const showPeriod = showPeriodColumn(baseDate);
  const extras = projectionExtras(rows, t.projGrid);
  return (
    <TableWrap label={t.projGrid.caption}>
      <table className="data">
        <caption className="sr-only">{t.projGrid.caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="left sticky-col">
              {t.projGrid.year}
            </th>
            {showPeriod && (
              <th scope="col" className="left">
                {t.projGrid.period}
              </th>
            )}
            <th scope="col">{t.projGrid.value}</th>
            <th scope="col">{t.projGrid.debt}</th>
            <th scope="col">{t.projGrid.equity}</th>
            <th scope="col">
              <MetricLabel term="ltv">{t.projGrid.ltv}</MetricLabel>
            </th>
            <th scope="col">{t.projGrid.grossRent}</th>
            <th scope="col">
              <MetricLabel term="egi">{t.projGrid.effective}</MetricLabel>
            </th>
            <th scope="col">{t.projGrid.holding}</th>
            <th scope="col">
              <MetricLabel term="noi">{t.projGrid.noi}</MetricLabel>
            </th>
            <th scope="col">{t.projGrid.interest}</th>
            <th scope="col">{t.projGrid.principal}</th>
            <th scope="col">{t.projGrid.debtSvc}</th>
            <th scope="col">{t.projGrid.netCf}</th>
            <th scope="col">{t.projGrid.cashToOwner}</th>
            <th scope="col">
              <MetricLabel term="dscr">{t.projGrid.dscr}</MetricLabel>
            </th>
            {extras.map(({ key, header }) => (
              <th key={key} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            // The opening row (year 0) is a stock snapshot: its flow fields are
            // structurally N/A (engine hard-codes them to 0), so dash them like DSCR.
            const opening = r.year <= 0;
            const flow = (v: Decimal, signed = false) =>
              opening ? (
                <span className="proj-na">—</span>
              ) : (
                <Money
                  value={v}
                  parens={signed}
                  suffix={false}
                  signed={signed}
                />
              );
            return (
              <tr
                key={r.year}
                className={i === 0 || i === last ? "is-strong" : ""}
              >
                <td className="left sticky-col">
                  {yearLabel(t, r.year, r.calendarYear)}
                </td>
                {showPeriod && (
                  <td className="left proj-period">
                    {periodLabelLocalized(
                      baseDate,
                      r.year,
                      t.monthsShort,
                      t.projGrid.opening,
                    )}
                  </td>
                )}
                <td>
                  <Money value={r.value} parens={false} suffix={false} />
                </td>
                <td>
                  <Money
                    value={r.committedDebt}
                    parens={false}
                    suffix={false}
                  />
                </td>
                <td>
                  <Money value={r.equity} suffix={false} />
                </td>
                <td>
                  <Pct value={r.ltv} dp={1} />
                </td>
                <td>{flow(r.grossRent)}</td>
                <td>{flow(r.effectiveRent)}</td>
                <td>{flow(r.holdingCosts)}</td>
                <td>{flow(r.noi, true)}</td>
                <td>{flow(r.interest)}</td>
                <td>{flow(r.principal)}</td>
                <td>{flow(r.debtService)}</td>
                <td>{flow(r.netCashFlow, true)}</td>
                <td>{flow(r.cashToOwner, true)}</td>
                <td>{r.dscr ? fmtDscr(r.dscr) : "—"}</td>
                {extras.map(({ key }) => (
                  <td key={key}>{flow(r[key])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
