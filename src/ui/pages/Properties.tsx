import { useEffect, useState, type ReactNode } from "react";
import type { Decimal } from "../../lib/money";
import { MetricLabel } from "../components/MetricLabel";
import { Pencil, Trash2, Plus, Building2, Upload } from "lucide-react";
import { useEngine, usePropertyProjections } from "../../state/useEngine";
import { useAsOf } from "../hooks/useAsOf";
import { asOfView, propertyRowsForAsOf } from "../model/dashboard";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { AppShell } from "../components/AppShell";
import {
  Panel,
  Button,
  Money,
  Badge,
  EmptyState,
  HealthMarker,
  TableWrap,
  Pct,
} from "../components/primitives";
import { PropertyFormModal } from "../components/PropertyFormModal";
import { PropertyLink } from "../components/PropertyLink";
import { SampleBanner } from "../components/SampleBanner";
import { fmtCzkM, fmtDate, noBreak, fmtPct, fmtDscr } from "../../lib/format";
import { undrawnPart } from "../model/debt";
import { dscrBand, dscrBandWord, ltvBand, ltvBandWord } from "../model/health";
import { bandLegend, hasMarkers, propertiesTotal } from "../model/properties";
import { useT } from "../hooks/useT";
import { ConfirmRow } from "../components/ConfirmRow";
import { RowActions, WriteRowAction } from "../components/RowActions";
import { propertiesSubtitle } from "../model/tableContext";

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
      <Money value={debt} parens={false} suffix={false} />
      {undrawnPart(undrawn) && (
        <span className="cell-sub cell-note">
          {t.common.undrawnDebt(noBreak(fmtCzkM(undrawn)))}
        </span>
      )}
    </>
  );
}

export function Properties() {
  const t = useT();
  // Today by the one resolver, as Property detail shows it at Today (ADR 0150); Properties
  // does not follow the picked as-of date (ADR 0111).
  const view = useAsOf({ followPick: false });
  const engine = useEngine(null, view?.date ?? null);
  const projections = usePropertyProjections();
  const removeProperty = usePortfolioStore((s) => s.removeProperty);
  const openProperty = useUiStore((s) => s.openProperty);
  const navigate = useUiStore((s) => s.navigate);

  const [adding, setAdding] = useState(false);
  const newPropertyRequested = useUiStore((s) => s.newPropertyRequested);
  const clearNewPropertyRequest = useUiStore((s) => s.clearNewPropertyRequest);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // File ▸ New Property… (⌘N, UX-066) lands here with a one-shot request: open the form
  // during render, then clear the request in the store.
  if (newPropertyRequested && !adding) setAdding(true);
  useEffect(() => {
    if (newPropertyRequested) clearNewPropertyRequest();
  }, [newPropertyRequested, clearNewPropertyRequest]);

  // The Today basis of the date, and each row read by it.
  const basis =
    engine && view
      ? asOfView(engine.assumptions.baseDate, view.date, view.isToday)
      : null;
  const perProperty =
    engine && view && basis && projections
      ? propertyRowsForAsOf(
          engine.snapshot.perProperty,
          engine.portfolio.properties,
          projections,
          basis,
          view.date,
          engine.assumptions,
        )
      : [];
  const deleteTarget = perProperty.find((p) => p.propertyId === deletingId);
  const total =
    engine && basis
      ? propertiesTotal(
          engine.snapshot,
          engine.projection,
          basis,
          engine.assumptions,
          engine.portfolio.properties,
          t,
        )
      : null;
  /** A pending purchase has no figures yet, only its purchase date (ADR 0156); a screen
   *  reader hears why in each cell (ADR 0189). */
  const notOwned = (
    // Positioned (.cell-not-owned), so the hidden text stays inside the table's scroll box and cannot
    // widen the page from a scrolled-off column.
    <span className="cell-not-owned">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t.properties.notOwnedCell}</span>
    </span>
  );
  const fig = (owned: boolean, cell: ReactNode) => (owned ? cell : notOwned);

  async function handleDelete(id: string) {
    const result = await removeProperty(id);
    // On failure the confirm row stays open and says why (UX-050). Row actions are
    // disabled while the delete runs, so this is still its confirm (ADR 0253).
    if (result.ok) setDeletingId(null);
    return result;
  }

  return (
    <AppShell
      title={t.properties.title}
      subtitle={
        engine && basis && perProperty.length > 0
          ? propertiesSubtitle(
              t,
              perProperty.length,
              engine.snapshot.asOf,
              basis,
              engine.assumptions.baseDate,
            )
          : undefined
      }
      showLens={false}
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
          {t.properties.addProperty}
        </Button>
      }
    >
      <SampleBanner />
      {perProperty.length === 0 ? (
        <EmptyState
          title={t.properties.emptyTitle}
          icon={Building2}
          action={
            <div className="row">
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => setAdding(true)}
              >
                {t.properties.addProperty}
              </Button>
              <Button icon={Upload} onClick={() => navigate("import")}>
                {t.common.importCsv}
              </Button>
            </div>
          }
        >
          {t.properties.emptyBody}
        </EmptyState>
      ) : (
        <Panel flush>
          <TableWrap label={t.properties.title}>
            <table className="data wrap-head">
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
                    <span className="th-label">
                      {t.properties.colNetCashFlow}
                    </span>
                  </th>
                  <th scope="col">
                    <MetricLabel term="dscr">
                      {t.properties.colDscr}
                    </MetricLabel>
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
              <tbody>
                {perProperty.map((p) => (
                  <tr
                    key={p.propertyId}
                    className="row-link"
                    onClick={() => {
                      if (deletingId === p.propertyId) return;
                      openProperty(p.propertyId);
                    }}
                  >
                    <td className="left sticky-col cell-strong">
                      {/* A real button so the keyboard can drill in too; the row
                          click stays as the mouse shortcut (UX-022). */}
                      <PropertyLink
                        id={p.propertyId}
                        name={p.name}
                        stopPropagation
                      />
                      {!p.active && (
                        <span className="ml-s2">
                          <Badge band="neutral">
                            {t.properties.badgeInactive}
                          </Badge>
                        </span>
                      )}
                      {/* A pending purchase: its badge leads the line under the
                          name, with the purchase date, so the name column stays
                          narrow (ADR 0156, ADR 0205 §6). */}
                      {!p.owned && (
                        <span className="cell-sub">
                          <Badge band="neutral">
                            {t.properties.badgePending}
                          </Badge>{" "}
                          {t.properties.pendingPurchaseOn(
                            fmtDate(p.purchaseDate),
                          )}
                        </span>
                      )}
                    </td>
                    <td>{fig(p.owned, <LtvCell ltv={p.ltv} />)}</td>
                    <td>
                      {fig(
                        p.owned,
                        <Money value={p.netCashFlow} suffix={false} signed />,
                      )}
                    </td>
                    <td>{fig(p.owned, <DscrCell dscr={p.dscr} />)}</td>
                    <td>
                      {fig(
                        p.owned,
                        <Money
                          value={p.reportedValue}
                          parens={false}
                          suffix={false}
                        />,
                      )}
                    </td>
                    <td>
                      {/* A pending loan already drawn is owed now: the Dashboard's
                          total debt counts it (ADR 0165). The drawn debt, beside the
                          value less the tranches not drawn yet (ADR 0169). */}
                      {fig(
                        p.owned || !p.debt.isZero(),
                        <DebtCell debt={p.debt} undrawn={p.undrawnDebt} />,
                      )}
                    </td>
                    <td>
                      {fig(p.owned, <Money value={p.equity} suffix={false} />)}
                    </td>
                    <td>
                      {fig(
                        p.owned,
                        <Money value={p.noi} parens={false} suffix={false} />,
                      )}
                    </td>
                    <td
                      className="actions-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowActions>
                        <WriteRowAction
                          icon={Pencil}
                          label={t.common.edit}
                          onClick={() => setEditingId(p.propertyId)}
                        />
                        <WriteRowAction
                          icon={Trash2}
                          label={t.common.delete}
                          danger
                          onClick={() => setDeletingId(p.propertyId)}
                        />
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
              {total && (
                // The portfolio's figures, as the Dashboard shows them at Today with
                // "All" (ADR 0205 §5).
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
                      <Money
                        value={total.value}
                        parens={false}
                        suffix={false}
                      />
                    </td>
                    <td>
                      <DebtCell debt={total.debt} undrawn={total.undrawnDebt} />
                    </td>
                    <td>
                      <Money value={total.equity} suffix={false} />
                    </td>
                    <td>
                      <Money value={total.noi} parens={false} suffix={false} />
                    </td>
                    <td className="actions-col" />
                  </tr>
                </tfoot>
              )}
            </table>
          </TableWrap>
          {/* The markers' words, when a row shows one; each cell already says its band
              to assistive technology (ADR 0205 §2). */}
          {hasMarkers(perProperty) && (
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
          )}
          {deleteTarget && (
            // Outside .table-wrap so the message is never clipped by the scroll (UX-019).
            <ConfirmRow
              key={deleteTarget.propertyId}
              message={t.properties.confirmDelete(deleteTarget.name)}
              confirmLabel={t.common.yesDelete}
              busyLabel={t.common.deleting}
              onConfirm={() => handleDelete(deleteTarget.propertyId)}
              onCancel={() => setDeletingId(null)}
            />
          )}
        </Panel>
      )}

      {adding && (
        <PropertyFormModal mode="add" onClose={() => setAdding(false)} />
      )}
      {editingId !== null && (
        <PropertyFormModal
          mode="edit"
          propertyId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}
    </AppShell>
  );
}
