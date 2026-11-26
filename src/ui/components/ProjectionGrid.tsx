// Dense year-by-year grid, shared by the Projections screen and Property detail.
// Renders SeriesRow[] (already lensed Nominal/Real). Money compact (no "Kč" suffix).
import type { ReactNode } from "react";
import { MetricLabel } from "./MetricLabel";
import { Money } from "./figures";
import { TableWrap } from "./layout";
import { Pct } from "./rates";
import { fmtDscr, orDash } from "../../lib/format";
import type { Decimal } from "../../lib/money";
import {
  projectionGridColumns,
  yearCellPeriod,
  yearLabel,
  type ProjectionColumn,
  type SeriesRow,
} from "../model/projection";
import { useT } from "../hooks/useT";

/** A stock figure: no parentheses, no "Kč". */
const stock = (v: Decimal) => <Money value={v} parens={false} suffix={false} />;

/** A flow figure. The opening row (year 0) is a stock snapshot: its flow fields are
 *  structurally N/A (engine hard-codes them to 0), so they are dashed like DSCR. */
function flow(r: SeriesRow, v: Decimal, signed = false): ReactNode {
  if (r.year <= 0) return <span className="proj-na">—</span>;
  return <Money value={v} parens={signed} suffix={false} signed={signed} />;
}

/** A column's cell for a row, as its kind shows it. Only LTV (n/a) and DSCR (a dash)
 *  are ever null. */
function cellFor(c: ProjectionColumn, r: SeriesRow): ReactNode {
  const v = c.value(r);
  if (c.cell === "percent") return <Pct value={v} dp={1} />;
  if (c.cell === "multiple") return orDash(v, fmtDscr);
  if (v === null) return null;
  switch (c.cell) {
    case "stock":
      return stock(v);
    case "balance":
      return <Money value={v} suffix={false} />;
    default:
      return flow(r, v, c.cell === "signedFlow");
  }
}

export function ProjectionGrid({
  rows,
  baseDate,
}: {
  rows: SeriesRow[];
  baseDate: Date;
}) {
  const t = useT();
  const last = rows.length - 1;
  const columns = projectionGridColumns(rows, t.projGrid);
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
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.term ? (
                  <MetricLabel term={c.term}>{c.header}</MetricLabel>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
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
                {columns.map((c) => (
                  <td key={c.key}>{cellFor(c, r)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
