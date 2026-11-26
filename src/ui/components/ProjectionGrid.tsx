// Dense year-by-year grid, shared by the Projections screen and Property detail.
// Renders SeriesRow[] (already lensed Nominal/Real). Money compact (no "Kč" suffix).
import type { ReactNode } from "react";
import { MetricLabel } from "./MetricLabel";
import { Money } from "./figures";
import { TableWrap } from "./layout";
import { Pct } from "./rates";
import { fmtDscr } from "../../lib/format";
import type { Decimal } from "../../lib/money";
import { purchasedValue } from "../../engine";
import {
  projectionExtras,
  purchasesColumn,
  undrawnColumn,
  yearCellPeriod,
  yearLabel,
  type SeriesRow,
} from "../model/projection";
import type { Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";

/** A column after Year: its header and the cell it shows for a row. */
interface GridColumn {
  key: string;
  header: ReactNode;
  cell: (r: SeriesRow) => ReactNode;
}

/** A stock figure: no parentheses, no "Kč". */
const stock = (v: Decimal) => <Money value={v} parens={false} suffix={false} />;

/** A flow figure. The opening row (year 0) is a stock snapshot: its flow fields are
 *  structurally N/A (engine hard-codes them to 0), so they are dashed like DSCR. */
function flow(r: SeriesRow, v: Decimal, signed = false): ReactNode {
  if (r.year <= 0) return <span className="proj-na">—</span>;
  return <Money value={v} parens={signed} suffix={false} signed={signed} />;
}

/** Every column after Year, in order: a column is one entry here. The optional ones show
 *  only when some year has a value for them. */
function gridColumns(
  rows: SeriesRow[],
  g: Dictionary["projGrid"],
): GridColumn[] {
  return [
    // ADR 0169: the value less the tranches not drawn yet, a purchase's value and
    // construction (ADR 0194), the drawn balance, and those tranches while a
    // development loan draws.
    { key: "value", header: g.value, cell: (r) => stock(r.reportedValue) },
    ...purchasesColumn(rows, g).map(({ key, header }) => ({
      key,
      header,
      cell: (r: SeriesRow) => flow(r, purchasedValue(r)),
    })),
    { key: "debt", header: g.debt, cell: (r) => stock(r.balance) },
    ...undrawnColumn(rows, g).map(({ key, header }) => ({
      key,
      header,
      cell: (r: SeriesRow) => stock(r[key]),
    })),
    {
      key: "equity",
      header: g.equity,
      cell: (r) => <Money value={r.equity} suffix={false} />,
    },
    {
      key: "ltv",
      header: <MetricLabel term="ltv">{g.ltv}</MetricLabel>,
      cell: (r) => <Pct value={r.ltv} dp={1} />,
    },
    {
      key: "grossRent",
      header: g.grossRent,
      cell: (r) => flow(r, r.grossRent),
    },
    {
      key: "effectiveRent",
      header: <MetricLabel term="egi">{g.effective}</MetricLabel>,
      cell: (r) => flow(r, r.effectiveRent),
    },
    { key: "holding", header: g.holding, cell: (r) => flow(r, r.holdingCosts) },
    {
      key: "noi",
      header: <MetricLabel term="noi">{g.noi}</MetricLabel>,
      cell: (r) => flow(r, r.noi, true),
    },
    { key: "interest", header: g.interest, cell: (r) => flow(r, r.interest) },
    {
      key: "principal",
      header: g.principal,
      cell: (r) => flow(r, r.principal),
    },
    { key: "debtSvc", header: g.debtSvc, cell: (r) => flow(r, r.debtService) },
    {
      key: "netCf",
      header: g.netCf,
      cell: (r) => flow(r, r.netCashFlow, true),
    },
    {
      key: "cashToOwner",
      header: g.cashToOwner,
      cell: (r) => flow(r, r.cashToOwner, true),
    },
    {
      key: "dscr",
      header: <MetricLabel term="dscr">{g.dscr}</MetricLabel>,
      cell: (r) => (r.dscr ? fmtDscr(r.dscr) : "—"),
    },
    ...projectionExtras(rows, g).map(({ key, header }) => ({
      key,
      header,
      cell: (r: SeriesRow) => flow(r, r[key]),
    })),
  ];
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
  const columns = gridColumns(rows, t.projGrid);
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
                {c.header}
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
                  <td key={c.key}>{c.cell(r)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
