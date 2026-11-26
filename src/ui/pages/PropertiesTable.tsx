// The Properties table: a row per property, the totals row and the band legend.
import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Decimal } from "../../lib/money";
import { MetricLabel } from "../components/MetricLabel";
import { Money } from "../components/figures";
import { TableWrap } from "../components/layout";
import { Pct } from "../components/rates";
import { Badge, HealthMarker } from "../components/status";
import { PropertyLink } from "../components/PropertyLink";
import { RowActions, WriteRowAction } from "../components/RowActions";
import { fmtCzkM, fmtDate, noBreak, fmtPct, fmtDscr } from "../../lib/format";
import { undrawnPart } from "../model/debt";
import { dscrBand, dscrBandWord, ltvBand, ltvBandWord } from "../model/health";
import {
  bandLegend,
  hasMarkers,
  type PropertiesTotal,
} from "../model/properties";
import type { PropertiesTableRow } from "../hooks/usePropertiesTable";
import { useT } from "../hooks/useT";

/** An amount with no parentheses and no "Kč": the value, debt and NOI cells. */
function Amount({ value }: { value: Decimal }) {
  return <Money value={value} parens={false} suffix={false} />;
}

/** LTV as a figure and its health marker; the band word is the marker's tooltip and
 *  screen-reader text (ADR 0205). No value: "n/a" and no marker (ADR 0133). */
function LtvCell({ ltv }: { ltv: Decimal | null }) {
  const t = useT();
  const word = ltvBandWord(t, ltv);
  if (ltv === null || word === null) return <Pct value={null} />;
  return (
    <>
      <span className="num">{fmtPct(ltv)}</span>
      <HealthMarker band={ltvBand(ltv)} word={word} />
    </>
  );
}

/** DSCR as a figure and its health marker; no debt: "—" (ADR 0205). */
function DscrCell({ dscr }: { dscr: Decimal | null }) {
  const t = useT();
  const word = dscrBandWord(t, dscr);
  if (dscr === null || word === null) return <>—</>;
  return (
    <>
      <span className="num">{fmtDscr(dscr)}</span>
      <HealthMarker band={dscrBand(dscr)} word={word} />
    </>
  );
}

/** The drawn debt, with the tranches still to draw on a short line under it (ADR 0169,
 *  ADR 0205): the line wraps inside the column, it never widens it. */
function DebtCell({ debt, undrawn }: { debt: Decimal; undrawn: Decimal }) {
  const t = useT();
  return (
    <>
      <Amount value={debt} />
      {undrawnPart(undrawn) && (
        <span className="cell-sub cell-note">
          {t.common.undrawnDebt(noBreak(fmtCzkM(undrawn)))}
        </span>
      )}
    </>
  );
}

/** A cell with no figure yet: a pending purchase has only its purchase date (ADR 0156);
 *  a screen reader hears why in each cell (ADR 0189). */
function Fig({ show, children }: { show: boolean; children: ReactNode }) {
  const t = useT();
  if (show) return <>{children}</>;
  return (
    // Positioned (.cell-not-owned), so the hidden text stays inside the table's scroll box and cannot
    // widen the page from a scrolled-off column.
    <span className="cell-not-owned">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t.properties.notOwnedCell}</span>
    </span>
  );
}

function PropertiesHead() {
  const t = useT();
  return (
    <thead>
      <tr>
        <th scope="col" className="left sticky-col">
          {t.properties.colProperty}
        </th>
        {/* Risk and cash flow first, so they stay in view in narrow
            windows (ADR 0085). */}
        <th scope="col">
          <MetricLabel term="ltv">{t.properties.colLtv}</MetricLabel>
        </th>
        {/* A word label wraps to at most two lines (ADR 0158). */}
        <th scope="col">
          <span className="th-label">{t.properties.colNetCashFlow}</span>
        </th>
        <th scope="col">
          <MetricLabel term="dscr">{t.properties.colDscr}</MetricLabel>
        </th>
        <th scope="col">
          <span className="th-label">{t.properties.colValue}</span>
        </th>
        <th scope="col">
          <span className="th-label">{t.properties.colDebt}</span>
        </th>
        <th scope="col">
          <span className="th-label">{t.properties.colEquity}</span>
        </th>
        <th scope="col">
          <MetricLabel term="noi">{t.properties.colNoi}</MetricLabel>
        </th>
        <th scope="col" className="actions-col">
          <span className="sr-only">{t.common.actions}</span>
        </th>
      </tr>
    </thead>
  );
}

/** The name cell: the link, the inactive badge, and a pending purchase's line. */
function NameCell({ p }: { p: PropertiesTableRow }) {
  const t = useT();
  return (
    <td className="left sticky-col cell-strong">
      {/* A real button so the keyboard can drill in too; the row
          click stays as the mouse shortcut. */}
      <PropertyLink id={p.propertyId} name={p.name} stopPropagation />
      {!p.active && (
        <span className="ml-s2">
          <Badge band="neutral">{t.properties.badgeInactive}</Badge>
        </span>
      )}
      {/* A pending purchase: its badge leads the line under the
          name, with the purchase date, so the name column stays
          narrow (ADR 0156, ADR 0205 §6). */}
      {!p.owned && (
        <span className="cell-sub">
          <Badge band="neutral">{t.properties.badgePending}</Badge>{" "}
          {t.properties.pendingPurchaseOn(fmtDate(p.purchaseDate))}
        </span>
      )}
    </td>
  );
}

interface RowHandlers {
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function PropertyRow({
  p,
  onOpen,
  onEdit,
  onDelete,
}: RowHandlers & { p: PropertiesTableRow }) {
  const t = useT();
  const { figures, debt } = p.show;
  return (
    <tr className="row-link" onClick={() => onOpen(p.propertyId)}>
      <NameCell p={p} />
      <td>
        <Fig show={figures}>
          <LtvCell ltv={p.ltv} />
        </Fig>
      </td>
      <td>
        <Fig show={figures}>
          <Money value={p.netCashFlow} suffix={false} signed />
        </Fig>
      </td>
      <td>
        <Fig show={figures}>
          <DscrCell dscr={p.dscr} />
        </Fig>
      </td>
      <td>
        <Fig show={figures}>
          <Amount value={p.reportedValue} />
        </Fig>
      </td>
      <td>
        {/* The drawn debt, beside the value less the tranches not drawn yet
            (ADR 0169); a pending loan's too, once drawn (ADR 0165). */}
        <Fig show={debt}>
          <DebtCell debt={p.debt} undrawn={p.undrawnDebt} />
        </Fig>
      </td>
      <td>
        <Fig show={figures}>
          <Money value={p.equity} suffix={false} />
        </Fig>
      </td>
      <td>
        <Fig show={figures}>
          <Amount value={p.noi} />
        </Fig>
      </td>
      <td className="actions-col" onClick={(e) => e.stopPropagation()}>
        <RowActions>
          <WriteRowAction
            icon={Pencil}
            label={t.common.edit}
            onClick={() => onEdit(p.propertyId)}
          />
          <WriteRowAction
            icon={Trash2}
            label={t.common.delete}
            danger
            onClick={() => onDelete(p.propertyId)}
          />
        </RowActions>
      </td>
    </tr>
  );
}

/** The portfolio's figures, as the Dashboard shows them at Today with "All"
 *  (ADR 0205 §5). */
function TotalRow({ total }: { total: PropertiesTotal }) {
  return (
    <tfoot>
      <tr className="total-row">
        <th scope="row" className="left sticky-col">
          {total.label}
        </th>
        <td>
          <LtvCell ltv={total.ltv} />
        </td>
        <td>
          <Money value={total.netCashFlow} suffix={false} signed />
        </td>
        <td>
          <DscrCell dscr={total.dscr} />
        </td>
        <td>
          <Amount value={total.value} />
        </td>
        <td>
          <DebtCell debt={total.debt} undrawn={total.undrawnDebt} />
        </td>
        <td>
          <Money value={total.equity} suffix={false} />
        </td>
        <td>
          <Amount value={total.noi} />
        </td>
        <td className="actions-col" />
      </tr>
    </tfoot>
  );
}

/** The markers' words, when a row shows one; each cell already says its band to
 *  assistive technology (ADR 0205 §2). */
export function BandLegend({ rows }: { rows: readonly PropertiesTableRow[] }) {
  const t = useT();
  if (!hasMarkers(rows)) return null;
  return (
    <p className="band-legend" aria-hidden="true">
      {bandLegend(t).map((g) => (
        <span key={g.label} className="band-legend-group">
          <span className="band-legend-label">{g.label}</span>
          {g.items.map((i) => (
            <span key={i.word} className="band-legend-item">
              {i.bands.map((b) => (
                <HealthMarker key={b} band={b} word={i.word} />
              ))}{" "}
              {i.word}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}

export function PropertiesTable({
  rows,
  total,
  ...handlers
}: RowHandlers & {
  rows: readonly PropertiesTableRow[];
  total: PropertiesTotal | null;
}) {
  const t = useT();
  return (
    <TableWrap label={t.properties.title}>
      <table className="data wrap-head">
        <PropertiesHead />
        <tbody>
          {rows.map((p) => (
            <PropertyRow key={p.propertyId} p={p} {...handlers} />
          ))}
        </tbody>
        {total && <TotalRow total={total} />}
      </table>
    </TableWrap>
  );
}
