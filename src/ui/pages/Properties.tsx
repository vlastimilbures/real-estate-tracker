import { useEffect, useState } from "react";
import { MetricLabel } from "../components/MetricLabel";
import { Pencil, Trash2, Plus, Building2, Upload } from "lucide-react";
import { useEngine } from "../../state/useEngine";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { AppShell } from "../components/AppShell";
import {
  Panel,
  Button,
  Money,
  Badge,
  EmptyState,
  TableWrap,
  Pct,
} from "../components/primitives";
import { PropertyFormModal } from "../components/PropertyFormModal";
import { SampleBanner } from "../components/SampleBanner";
import { fmtPct, fmtDscr } from "../../lib/format";
import {
  bandPill,
  dscrBand,
  dscrBandWord,
  ltvBand,
  ltvBandWord,
} from "../model/health";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import { propertiesSubtitle } from "../model/tableContext";

export function Properties() {
  const t = useT();
  const engine = useEngine();
  const removeProperty = usePortfolioStore((s) => s.removeProperty);
  const openProperty = useUiStore((s) => s.openProperty);
  const navigate = useUiStore((s) => s.navigate);

  const [adding, setAdding] = useState(false);
  const newPropertyRequested = useUiStore((s) => s.newPropertyRequested);
  const clearNewPropertyRequest = useUiStore((s) => s.clearNewPropertyRequest);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // File ▸ New Property… (⌘N, UX-066) lands here with a one-shot request: open the form
  // during render, then clear the request in the store.
  if (newPropertyRequested && !adding) setAdding(true);
  useEffect(() => {
    if (newPropertyRequested) clearNewPropertyRequest();
  }, [newPropertyRequested, clearNewPropertyRequest]);

  const perProperty = engine?.snapshot.perProperty ?? [];
  const deleteTarget = perProperty.find((p) => p.propertyId === deletingId);

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    const result = await removeProperty(id);
    setDeleting(false);
    // On failure keep the confirm row open and say why, next to the buttons (UX-050).
    if (result.ok) setDeletingId(null);
    else setDeleteError(describeWriteError(t, result.error).message);
  }

  return (
    <AppShell
      title={t.properties.title}
      subtitle={
        engine && perProperty.length > 0
          ? propertiesSubtitle(t, perProperty.length, engine.snapshot.asOf)
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
            <table className="data">
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
                  <th scope="col">{t.properties.colNetCashFlow}</th>
                  <th scope="col">
                    <MetricLabel term="dscr">
                      {t.properties.colDscr}
                    </MetricLabel>
                  </th>
                  <th scope="col">{t.properties.colValue}</th>
                  <th scope="col">{t.properties.colDebt}</th>
                  <th scope="col">{t.properties.colEquity}</th>
                  <th scope="col">
                    <MetricLabel term="noi">{t.properties.colNoi}</MetricLabel>
                  </th>
                  <th scope="col" className="actions-col"></th>
                </tr>
              </thead>
              <tbody>
                {perProperty.map((p) => (
                  <tr
                    key={p.propertyId}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      if (deletingId === p.propertyId) return;
                      openProperty(p.propertyId);
                    }}
                  >
                    <td className="left sticky-col" style={{ fontWeight: 600 }}>
                      {/* A real button so the keyboard can drill in too; the row
                          click stays as the mouse shortcut (UX-022). */}
                      <button
                        type="button"
                        className="link-button cell-name"
                        // Long names are cut with an ellipsis; the full name shows
                        // on hover and stays the accessible name (ADR 0085).
                        title={p.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          openProperty(p.propertyId);
                        }}
                      >
                        {p.name}
                      </button>
                      {!p.owned && (
                        <span style={{ marginLeft: "var(--s2)" }}>
                          <Badge band="neutral">
                            {t.properties.badgePending}
                          </Badge>
                        </span>
                      )}
                      {!p.active && (
                        <span style={{ marginLeft: "var(--s2)" }}>
                          <Badge band="neutral">
                            {t.properties.badgeInactive}
                          </Badge>
                        </span>
                      )}
                    </td>
                    <td>
                      {p.ltv === null ? (
                        <Pct value={null} />
                      ) : (
                        <Badge band={ltvBand(p.ltv)}>
                          {bandPill(fmtPct(p.ltv), ltvBandWord(t, p.ltv))}
                        </Badge>
                      )}
                    </td>
                    <td>
                      <Money value={p.netCashFlow} suffix={false} signed />
                    </td>
                    <td>
                      {p.dscr ? (
                        <Badge band={dscrBand(p.dscr)}>
                          {bandPill(fmtDscr(p.dscr), dscrBandWord(t, p.dscr))}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Money value={p.value} parens={false} suffix={false} />
                    </td>
                    <td>
                      <Money value={p.debt} parens={false} suffix={false} />
                    </td>
                    <td>
                      <Money value={p.equity} suffix={false} />
                    </td>
                    <td>
                      <Money value={p.noi} parens={false} suffix={false} />
                    </td>
                    <td
                      className="actions-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="row-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Pencil}
                          onClick={() => setEditingId(p.propertyId)}
                          title={t.properties.editProperty}
                        >
                          <span className="btn-label">{t.common.edit}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={Trash2}
                          onClick={() => {
                            setDeletingId(p.propertyId);
                            setDeleteError(null);
                          }}
                          title={t.properties.deleteProperty}
                        >
                          <span className="btn-label">{t.common.delete}</span>
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {deleteTarget && (
            // Outside .table-wrap so the message is never clipped by the scroll (UX-019).
            <div className="confirm-row">
              <div className="confirm-row-content">
                <span className="confirm-msg">
                  {t.properties.confirmDelete(deleteTarget.name)}
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={deleting}
                  onClick={() => handleDelete(deleteTarget.propertyId)}
                >
                  {deleting ? t.common.deleting : t.common.yesDelete}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setDeletingId(null);
                    setDeleteError(null);
                  }}
                  disabled={deleting}
                >
                  {t.common.cancel}
                </Button>
                {deleteError && (
                  <span className="error-text" role="alert">
                    {deleteError}
                  </span>
                )}
              </div>
            </div>
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
