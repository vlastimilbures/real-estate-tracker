import { useEffect, useState } from "react";
import { asOfBounds } from "../model/asOf";
import {
  Pencil,
  Power,
  PowerOff,
  Building2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
  ExportXlsxButton,
} from "../components/primitives";
import { PropertyFormModal } from "../components/PropertyFormModal";
import { toChartRows } from "../model/chartData";
import { ProjectionGrid } from "../components/ProjectionGrid";
import { AsOfPicker } from "../components/AsOfPicker";
import { SectionNav } from "../components/SectionNav";
import { focusSection } from "../components/focusSection";
import { PropertyDataCheckPanel } from "./PropertyDataCheck";
import {
  PropertySnapshotTiles,
  HoldingCostsPanel,
  ActivationBanner,
  AmortizationTable,
  LoanSummary,
  AcquisitionPanel,
} from "./PropertyDetailPanels";
import {
  ValuationsPanel,
  LeasesPanel,
  MortgagesPanel,
} from "./PropertyEntityPanels";
import { fmtDate } from "../../lib/format";
import { projectionSeries, projectionColumns } from "../model/projection";
import { lensLabel, projectionExportNotes } from "../model/tableContext";
import { exportTableXlsx } from "../exportXlsx";
import { exportFilename } from "../../lib/slug";
import { asOfView, asOfHint, propertyTilesForAsOf } from "../model/dashboard";
import {
  amortizationColumns,
  loanOutlook,
  loanWarningText,
  loanWarnings,
} from "../model/propertyDetail";
import { acquisitionView } from "../model/acquisition";
import { useToast } from "../hooks/useToast";
import { describeWriteError } from "../model/writeError";
import { useT } from "../hooks/useT";
import { useAsOf } from "../hooks/useAsOf";
import { useSectionSpy } from "../hooks/useSectionSpy";
import {
  isFormTarget,
  propertySections,
  sectionId,
  type PropertyFormTarget,
  type PropertySection,
} from "../model/sectionNav";

const AMORTIZATION_BODY = "pd-amortization-table";

export function PropertyDetail() {
  const t = useT();
  const propertyId = useUiStore((s) => s.selectedPropertyId);
  const navigate = useUiStore((s) => s.navigate);
  const openSettings = useUiStore((s) => s.openSettings);
  const mode = useUiStore((s) => s.mode);
  const asOf = useUiStore((s) => s.asOf);
  const setAsOf = useUiStore((s) => s.setAsOf);
  const propertyTarget = useUiStore((s) => s.propertyTarget);
  const clearPropertyTarget = useUiStore((s) => s.clearPropertyTarget);
  const amortizationOpen = useUiStore((s) => s.amortizationOpen);
  const setAmortizationOpen = useUiStore((s) => s.setAmortizationOpen);
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
  // The date the tiles, picker and subtitle are for, clamped to the window (ADR 0150).
  const view = useAsOf();
  const result = usePropertyEngineResult(propertyId, view?.date ?? null);
  // Stored data that breaks an engine rule: show the records to fix, no figures (DR-146).
  const invalid = result && "invalid" in result ? result.invalid : null;
  const out = result && !("invalid" in result) ? result : null;
  // The open property form: plain, or at its Acquisition section (a Data check link).
  const [editing, setEditing] = useState<false | PropertyFormTarget>(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  const { showToast } = useToast();
  const property = store.portfolio?.properties.find((p) => p.id === propertyId);
  const isActive = property?.active !== false;
  // The page's sections in order (ADR 0107); computed before the early return so the
  // spy hook runs on every render. A deactivated property has no Data check (ADR 0155).
  const sections = propertySections({
    overview: out !== null,
    dataCheck: out !== null && isActive,
    projection: out !== null,
    amortization: out !== null && out.schedule.length > 0,
  });
  const [currentSection, setCurrentSection] = useSectionSpy(
    sections.map(sectionId),
  );
  // A Dashboard data check link lands on its section, or opens the property form, once
  // the page shows the property (ADR 0118). The form opens during render, as Properties'
  // ⌘N request does; the effect moves focus and clears the request.
  const shown = property !== undefined;
  if (isFormTarget(propertyTarget) && shown && !editing)
    setEditing(propertyTarget);
  useEffect(() => {
    if (!propertyTarget || !shown) return;
    if (!isFormTarget(propertyTarget)) focusSection(sectionId(propertyTarget));
    clearPropertyTarget();
  }, [propertyTarget, shown, clearPropertyTarget]);

  // The engine result is null for an unknown id, so a stale or deleted selection lands
  // here too; the guard also narrows every field the page reads (DR-065).
  const assumptions = store.assumptions;
  if (
    propertyId === null ||
    !store.portfolio ||
    (!out && !invalid) ||
    !property ||
    !assumptions ||
    !view
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
  const id = property.id;

  async function activate() {
    setToggling(true);
    setActiveError(null);
    const result = await store.setPropertyActive(id, true);
    setToggling(false);
    if (!result.ok) setActiveError(describeWriteError(t, result.error).message);
  }

  async function deactivate() {
    const result = await store.setPropertyActive(id, false);
    // On failure the confirm stays open and says why (UX-050).
    if (result.ok) setConfirmingDeactivate(false);
    return result;
  }

  // Tiles under the chosen lens, by the Dashboard's as-of rule (DR-054, D-62): a future
  // as-of reads the projection year the charts plot; real terms are in base-date prices.
  const series = out ? projectionSeries(out.projection, mode, assumptions) : [];
  const basis = out
    ? asOfView(assumptions.baseDate, out.asOf, series, view.isToday)
    : null;
  const s =
    out && basis
      ? propertyTilesForAsOf(
          out.snapshot,
          series,
          basis,
          out.asOf,
          mode,
          assumptions,
          property.purchaseDate,
        )
      : null;
  const chartRows = toChartRows(series);
  // Picker hint by the same as-of basis as the tiles (ADR 0088).
  const pickerHint = basis ? asOfHint(t, basis, assumptions.baseDate) : null;

  const baseDate = assumptions.baseDate;
  // Loan checks for every block from the one in force onward (UX-054).
  // Skipped while the stored data breaks an engine rule (the checks would throw too),
  // and for a deactivated property: no data-entry nudge for a loan it no longer has
  // (ADR 0155).
  const warnings =
    out && isActive ? loanWarnings(mortgages, baseDate, out.eventOutcomes) : [];
  const outlook = out?.financing
    ? loanOutlook(out.financing, mortgages, t.propertyDetail)
    : null;

  const lens = lensLabel(t, mode);
  const modeWord = mode === "real" ? t.common.realLower : t.common.nominalLower;
  const sectionLabel: Record<PropertySection, string> = {
    overview: t.propertyDetail.sectionOverview,
    dataCheck: t.dataCheck.title,
    records: t.propertyDetail.sectionRecords,
    financing: t.propertyDetail.sectionFinancing,
    acquisition: t.propertyDetail.sectionAcquisition,
    holding: t.propertyDetail.sectionHolding,
    projection: t.propertyDetail.sectionProjection,
    amortization: t.propertyDetail.sectionAmortization,
  };
  const exportProjection = () =>
    exportTableXlsx({
      filename: exportFilename(property.name, property.id, "projection", mode),
      sheetName: t.xlsx.sheetNames.projection,
      columns: projectionColumns(t, baseDate, series),
      rows: series,
      notes: projectionExportNotes(t, property.name, mode, baseDate),
    });
  // Always nominal and dated per row: the property's name is the only context (ADR 0159).
  const exportAmortization = () =>
    exportTableXlsx({
      filename: exportFilename(property.name, property.id, "amortization"),
      sheetName: t.xlsx.sheetNames.amortization,
      columns: amortizationColumns(t, out?.schedule ?? []),
      rows: out?.schedule ?? [],
      notes: [property.name],
    });

  return (
    <AppShell
      title={property.name}
      subtitle={[
        property.type,
        property.sizeM2 ? t.propertyDetail.sizeM2(property.sizeM2) : null,
        // The tiles' own `owned`, so the subtitle and the tiles agree (ADR 0156).
        !s
          ? null
          : s.owned
            ? t.propertyDetail.purchased(fmtDate(property.purchaseDate))
            : t.propertyDetail.pendingPurchase(fmtDate(property.purchaseDate)),
        view.isToday ? null : t.propertyDetail.asOf(fmtDate(view.date)),
        isActive ? null : t.propertyDetail.deactivated,
      ]
        .filter(Boolean)
        .join(" · ")}
      subnav={
        <SectionNav
          label={t.propertyDetail.sectionNavLabel}
          sections={sections.map((sec) => ({
            id: sectionId(sec),
            label: sectionLabel[sec],
          }))}
          current={currentSection}
          onSelect={setCurrentSection}
        />
      }
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
              onClick={activate}
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
            onClick={() => setEditing("edit")}
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
        onConfirmDeactivate={deactivate}
        onCancelDeactivate={() => setConfirmingDeactivate(false)}
        error={activeError}
      />

      {invalid && (
        <InvalidDataNotice t={t} error={invalid} portfolio={store.portfolio} />
      )}

      {s && out && (
        <div className="pd-section" id={sectionId("overview")}>
          <h2 className="sr-only" tabIndex={-1}>
            {t.propertyDetail.sectionOverview}
          </h2>
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
            purchase={{
              purchaseDate: property.purchaseDate,
              price: out.acquisition.price,
              loan: out.acquisition.loan,
            }}
          />
        </div>
      )}

      {out && isActive && (
        <div className="pd-section" id={sectionId("dataCheck")}>
          <PropertyDataCheckPanel
            property={property}
            portfolio={store.portfolio}
            asOf={out.asOf}
            baseDate={baseDate}
            resetRate={assumptions.postFixationResetRatePa}
            onFix={(fix) =>
              fix === "assumptions"
                ? openSettings("assumptions")
                : isFormTarget(fix)
                  ? setEditing(fix)
                  : focusSection(sectionId(fix))
            }
          />
        </div>
      )}

      {/* Editable child entities */}
      <div className="pd-section" id={sectionId("records")}>
        <ValuationsPanel propertyId={propertyId} rows={valuations} />
        <LeasesPanel propertyId={propertyId} rows={leases} />
      </div>

      {/* The loan warnings sit with the blocks they describe (ADR 0107). They are
          standing state, not news: a status, not an alert on every visit (ADR 0157). */}
      <div className="pd-section" id={sectionId("financing")}>
        <MortgagesPanel propertyId={propertyId} rows={mortgages} />
        {warnings.map((w, i) => (
          <div
            className="banner warn"
            role="status"
            key={`${w.kind}-${w.block.id}-${i}`}
          >
            {loanWarningText(t, w, assumptions.postFixationResetRatePa)}
          </div>
        ))}
        {outlook && <LoanSummary outlook={outlook} />}
      </div>

      {out && (
        <div className="pd-section" id={sectionId("acquisition")}>
          <AcquisitionPanel
            view={acquisitionView(
              out.acquisition,
              property.funding?.note,
              t.propertyDetail,
            )}
          />
        </div>
      )}

      <div className="pd-section" id={sectionId("holding")}>
        <HoldingCostsPanel
          holding={holding}
          propertyId={propertyId}
          onSave={store.saveHoldingCost}
          onSaved={() => showToast(t.propertyDetail.holdingCostsSaved)}
        />
      </div>

      {/* Projection + amortization */}
      {out && (
        <div className="pd-section" id={sectionId("projection")}>
          <Panel
            title={t.propertyDetail.projectionTitle(assumptions.horizonYears)}
            hint={lens}
            action={<ExportXlsxButton onExport={exportProjection} />}
            flush
          >
            <ProjectionGrid rows={series} baseDate={assumptions.baseDate} />
          </Panel>
        </div>
      )}

      {/* Collapsed by default; the header and its export stay (ADR 0107). */}
      {out && out.schedule.length > 0 && (
        <div className="pd-section" id={sectionId("amortization")}>
          <Panel
            title={t.propertyDetail.amortizationTitle}
            hint={t.propertyDetail.amortizationMonths(out.schedule.length)}
            action={<ExportXlsxButton onExport={exportAmortization} />}
            flush
          >
            <div className="disclosure-row">
              <Button
                size="sm"
                icon={amortizationOpen ? ChevronUp : ChevronDown}
                aria-expanded={amortizationOpen}
                aria-controls={AMORTIZATION_BODY}
                onClick={() => setAmortizationOpen(!amortizationOpen)}
              >
                {amortizationOpen
                  ? t.propertyDetail.hideAmortization
                  : t.propertyDetail.showAmortization(out.schedule.length)}
              </Button>
            </div>
            <div id={AMORTIZATION_BODY}>
              {amortizationOpen && (
                <AmortizationTable schedule={out.schedule} />
              )}
            </div>
          </Panel>
        </div>
      )}

      {editing && (
        <PropertyFormModal
          mode="edit"
          propertyId={propertyId}
          openFunding={editing === "editFunding"}
          onClose={() => setEditing(false)}
        />
      )}
    </AppShell>
  );
}
