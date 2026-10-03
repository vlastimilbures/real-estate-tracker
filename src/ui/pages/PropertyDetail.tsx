import { useState } from "react";
import { asOfBounds } from "../model/asOf";
import { Pencil, Power, PowerOff, Building2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePortfolioStore } from "../../state/portfolioStore";
import { usePropertyEngineResult } from "../../state/useEngine";
import { InvalidDataNotice } from "../components/InvalidDataNotice";
import { useUiStore } from "../../state/uiStore";
import { AppShell } from "../components/AppShell";
import {
  Panel,
  Button,
  EmptyState,
  Toast,
  ExportXlsxButton,
} from "../components/primitives";
import { PropertyFormModal } from "../components/PropertyFormModal";
import { toChartRows } from "../model/chartData";
import { ProjectionGrid } from "../components/ProjectionGrid";
import { AsOfPicker } from "../components/AsOfPicker";
import {
  PropertySnapshotTiles,
  HoldingCostsPanel,
  ActivationBanner,
  AmortizationTable,
} from "./PropertyDetailPanels";
import {
  ValuationsPanel,
  LeasesPanel,
  MortgagesPanel,
} from "./PropertyEntityPanels";
import { todayUtc } from "../../lib/today";
import { fmtDate } from "../../lib/format";
import { projectionSeries, projectionColumns } from "../model/projection";
import { exportTableXlsx } from "../exportXlsx";
import { slug } from "../../lib/slug";
import { asOfBasis, asOfHint, propertyTilesForAsOf } from "../model/dashboard";
import {
  amortizationColumns,
  loanWarningText,
  loanWarnings,
} from "../model/propertyDetail";
import { useToast } from "../hooks/useToast";
import { describeWriteError } from "../model/writeError";
import { useT } from "../hooks/useT";

export function PropertyDetail() {
  const t = useT();
  const propertyId = useUiStore((s) => s.selectedPropertyId);
  const navigate = useUiStore((s) => s.navigate);
  const mode = useUiStore((s) => s.mode);
  const asOf = useUiStore((s) => s.asOf);
  const setAsOf = useUiStore((s) => s.setAsOf);
  // Only the fields this page reads, so an unrelated store change (error banner,
  // scenarios, status) does not re-render it (DR-056).
  const store = usePortfolioStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      assumptions: s.assumptions,
      setPropertyActive: s.setPropertyActive,
      saveHoldingCost: s.saveHoldingCost,
    })),
  );
  const result = usePropertyEngineResult(propertyId, asOf);
  // Stored data that breaks an engine rule: show the records to fix, no figures (DR-146).
  const invalid = result && "invalid" in result ? result.invalid : null;
  const out = result && !("invalid" in result) ? result : null;
  const [editing, setEditing] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // The engine result is null for an unknown id, so a stale or deleted selection lands
  // here too; the guard also narrows every field the page reads (DR-065).
  const property = store.portfolio?.properties.find((p) => p.id === propertyId);
  const assumptions = store.assumptions;
  if (
    !propertyId ||
    !store.portfolio ||
    (!out && !invalid) ||
    !property ||
    !assumptions
  ) {
    return (
      <AppShell title={t.propertyDetail.fallbackTitle} showLens={false}>
        <EmptyState
          title={t.propertyDetail.noneSelectedTitle}
          icon={Building2}
          action={
            <Button onClick={() => navigate("properties")}>
              {t.propertyDetail.backToProperties}
            </Button>
          }
        />
      </AppShell>
    );
  }

  const valuations = store.portfolio.valuations.filter(
    (v) => v.propertyId === propertyId,
  );
  const leases = store.portfolio.leases.filter(
    (l) => l.propertyId === propertyId,
  );
  const mortgages = store.portfolio.mortgages.filter(
    (m) => m.propertyId === propertyId,
  );
  const holding = store.portfolio.holdingCosts.find(
    (h) => h.propertyId === propertyId,
  );
  const isActive = property.active !== false;
  const id = property.id;

  async function setActive(active: boolean) {
    setToggling(true);
    setActiveError(null);
    const result = await store.setPropertyActive(id, active);
    setToggling(false);
    // On failure keep the confirm open and say why, next to the buttons (UX-050).
    if (result.ok) setConfirmingDeactivate(false);
    else setActiveError(describeWriteError(t, result.error).message);
  }

  // Tiles under the chosen lens, by the Dashboard's as-of rule (DR-054, D-62): a future
  // as-of reads the projection year the charts plot; real terms are in base-date prices.
  const series = out ? projectionSeries(out.projection, mode, assumptions) : [];
  const s = out
    ? propertyTilesForAsOf(out.snapshot, series, out.asOf, mode, assumptions)
    : null;
  const chartRows = toChartRows(series);
  // Picker hint by the same as-of rule as the tiles (ADR 0088).
  const pickerHint = out
    ? asOfHint(
        t,
        asOfBasis(
          assumptions.baseDate,
          out.asOf,
          series,
          asOf === null || asOf.getTime() === todayUtc().getTime(),
        ),
        assumptions.baseDate,
      )
    : null;

  const baseDate = assumptions.baseDate;
  // Loan checks for every block from the one in force onward (UX-054).
  // Skipped while the stored data breaks an engine rule (the checks would throw too).
  const warnings = out ? loanWarnings(mortgages, baseDate) : [];

  const lens =
    mode === "real"
      ? t.propertyDetail.realTermsLens
      : t.propertyDetail.nominalKcLens;
  const modeWord = mode === "real" ? t.common.realLower : t.common.nominalLower;
  const exportProjection = () =>
    exportTableXlsx({
      filename: `${slug(property.name)}-projection-${mode}.xlsx`,
      sheetName: t.xlsx.sheetNames.projection,
      columns: projectionColumns(t, baseDate),
      rows: series,
    });
  const exportAmortization = () =>
    exportTableXlsx({
      filename: `${slug(property.name)}-amortization.xlsx`,
      sheetName: t.xlsx.sheetNames.amortization,
      columns: amortizationColumns(t),
      rows: out?.schedule ?? [],
    });

  return (
    <AppShell
      title={property.name}
      subtitle={[
        property.type,
        property.sizeM2 ? t.propertyDetail.sizeM2(property.sizeM2) : null,
        !s
          ? null
          : s.owned
            ? t.propertyDetail.purchased(fmtDate(property.purchaseDate))
            : t.propertyDetail.pendingPurchase(fmtDate(property.purchaseDate)),
        asOf && asOf.getTime() !== todayUtc().getTime()
          ? t.propertyDetail.asOf(fmtDate(asOf))
          : null,
        isActive ? null : t.propertyDetail.deactivated,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          <Button onClick={() => navigate("properties")}>
            {t.propertyDetail.allProperties}
          </Button>
          {isActive ? (
            <Button
              icon={PowerOff}
              onClick={() => setConfirmingDeactivate(true)}
              title={t.propertyDetail.deactivateTitle}
            >
              {t.propertyDetail.deactivate}
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={Power}
              disabled={toggling}
              onClick={() => setActive(true)}
              title={t.propertyDetail.activateTitle}
            >
              {toggling
                ? t.propertyDetail.activating
                : t.propertyDetail.activate}
            </Button>
          )}
          <Button
            variant="primary"
            icon={Pencil}
            onClick={() => setEditing(true)}
          >
            {t.properties.editProperty}
          </Button>
        </>
      }
    >
      <ActivationBanner
        propertyName={property.name}
        isActive={isActive}
        confirmingDeactivate={confirmingDeactivate}
        toggling={toggling}
        onConfirmDeactivate={() => setActive(false)}
        onCancelDeactivate={() => {
          setConfirmingDeactivate(false);
          setActiveError(null);
        }}
        error={activeError}
      />

      {invalid && (
        <InvalidDataNotice t={t} error={invalid} portfolio={store.portfolio} />
      )}

      {s && (
        <>
          <div className="filter-bar">
            <span />
            <AsOfPicker
              value={asOf}
              onChange={setAsOf}
              bounds={asOfBounds(
                assumptions.baseDate,
                assumptions.horizonYears,
              )}
              hint={pickerHint}
            />
          </div>

          <PropertySnapshotTiles
            s={s}
            chartRows={chartRows}
            modeWord={modeWord}
          />
        </>
      )}

      {/* Editable child entities */}
      <ValuationsPanel propertyId={propertyId} rows={valuations} />

      <LeasesPanel propertyId={propertyId} rows={leases} />

      <MortgagesPanel propertyId={propertyId} rows={mortgages} />

      <HoldingCostsPanel
        holding={holding}
        propertyId={propertyId}
        onSave={store.saveHoldingCost}
        onSaved={() => showToast(t.propertyDetail.holdingCostsSaved)}
      />

      {/* Projection + amortization */}
      {out && (
        <Panel
          title={t.propertyDetail.projectionTitle(assumptions.horizonYears)}
          hint={lens}
          action={<ExportXlsxButton onExport={exportProjection} />}
          flush
        >
          <ProjectionGrid rows={series} baseDate={assumptions.baseDate} />
        </Panel>
      )}

      {warnings.map((w, i) => (
        <div
          className="banner warn"
          role="alert"
          key={`${w.kind}-${w.block.id}-${i}`}
        >
          {loanWarningText(t, w, assumptions.postFixationResetRatePa)}
        </div>
      ))}

      {out && out.schedule.length > 0 && (
        <Panel
          title={t.propertyDetail.amortizationTitle}
          hint={t.propertyDetail.amortizationMonths(out.schedule.length)}
          action={<ExportXlsxButton onExport={exportAmortization} />}
          flush
        >
          <AmortizationTable schedule={out.schedule} />
        </Panel>
      )}

      {editing && (
        <PropertyFormModal
          mode="edit"
          propertyId={propertyId}
          onClose={() => setEditing(false)}
        />
      )}
      {toast && <Toast message={toast} />}
    </AppShell>
  );
}
