// Dense year-by-year grid, shared by the Projections screen and Property detail.
// Renders SeriesRow[] (already lensed Nominal/Real). Money compact (no "Kč" suffix).
import { MetricLabel } from "./MetricLabel";
import { Money, Pct, TableWrap } from "./primitives";
import { fmtDscr } from "../../lib/format";
import type { Decimal } from "../../lib/money";
import {
  projectionExtras,
  purchasedValue,
  purchasesColumn,
  undrawnColumn,
  yearCellPeriod,
  yearLabel,
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
  const extras = projectionExtras(rows, t.projGrid);
  const undrawn = undrawnColumn(rows, t.projGrid);
  const purchases = purchasesColumn(rows, t.projGrid);
  return (
    <TableWrap label={t.projGrid.caption}>
      {/* Compact rows, the period in the Year cell (ADR 0211). */}
      <table className="data compact">
        <caption className="sr-only">{t.projGrid.caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="left sticky-col">
              {t.projGrid.year}
            </th>
            <th scope="col">{t.projGrid.value}</th>
            {purchases.map(({ key, header }) => (
              <th key={key} scope="col">
                {header}
              </th>
            ))}
            <th scope="col">{t.projGrid.debt}</th>
            {undrawn.map(({ key, header }) => (
              <th key={key} scope="col">
                {header}
              </th>
            ))}
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
            const period = yearCellPeriod(t, baseDate, r.year);
            return (
              <tr
                key={r.year}
                className={i === 0 || i === last ? "is-strong" : ""}
              >
                <td className="left sticky-col" title={period ?? undefined}>
                  {yearLabel(t, r.year, r.calendarYear)}
                  {period && <span className="sr-only">, {period}</span>}
                </td>
                {/* ADR 0169: the value less the tranches not drawn yet, a purchase's
                    value and construction (ADR 0194), the drawn balance, and those tranches
                    while a development loan draws. */}
                <td>
                  <Money
                    value={r.reportedValue}
                    parens={false}
                    suffix={false}
                  />
                </td>
                {purchases.map(({ key }) => (
                  <td key={key}>{flow(purchasedValue(r))}</td>
                ))}
                <td>
                  <Money value={r.balance} parens={false} suffix={false} />
                </td>
                {undrawn.map(({ key }) => (
                  <td key={key}>
                    <Money value={r[key]} parens={false} suffix={false} />
                  </td>
                ))}
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
