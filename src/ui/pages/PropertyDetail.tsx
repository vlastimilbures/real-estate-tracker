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
  Toast,
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
import { todayUtc } from "../../lib/today";
import { fmtDate } from "../../lib/format";
import { projectionSeries, projectionColumns } from "../model/projection";
import { exportTableXlsx } from "../exportXlsx";
import { slug } from "../../lib/slug";
import { asOfBasis, asOfHint, propertyTilesForAsOf } from "../model/dashboard";
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
  const result = usePropertyEngineResult(propertyId, asOf);
  // Stored data that breaks an engine rule: show the records to fix, no figures (DR-146).
  const invalid = result && "invalid" in result ? result.invalid : null;
  const out = result && !("invalid" in result) ? result : null;
  // The open property form: plain, or at its Acquisition section (a Data check link).
  const [editing, setEditing] = useState<false | PropertyFormTarget>(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  const { toast, showToast } = useToast();
  // The page's sections in order (ADR 0107); computed before the early return so the
  // spy hook runs on every render.
  const sections = propertySections({
    overview: out !== null,
    projection: out !== null,
    amortization: out !== null && out.schedule.length > 0,
  });
  const [currentSection, setCurrentSection] = useSectionSpy(
    sections.map(sectionId),
  );
  // A Dashboard data check link lands on its section, or opens the property form, once
  // the page shows the property (ADR 0118). The form opens during render, as Properties'
  // ⌘N request does; the effect moves focus and clears the request.
  const property = store.portfolio?.properties.find((p) => p.id === propertyId);
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
  const warnings = out
    ? loanWarnings(mortgages, baseDate, out.eventOutcomes)
    : [];
  const outlook = out?.financing
    ? loanOutlook(out.financing, mortgages, t.propertyDetail)
    : null;

  const lens =
    mode === "real"
      ? t.propertyDetail.realTermsLens
      : t.propertyDetail.nominalKcLens;
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
      filename: `${slug(property.name)}-projection-${mode}.xlsx`,
      sheetName: t.xlsx.sheetNames.projection,
      columns: projectionColumns(t, baseDate, series),
      rows: series,
    });
  const exportAmortization = () =>
    exportTableXlsx({
      filename: `${slug(property.name)}-amortization.xlsx`,
      sheetName: t.xlsx.sheetNames.amortization,
      columns: amortizationColumns(t, out?.schedule ?? []),
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
          />
        </div>
      )}

      {out && (
        <div className="pd-section" id={sectionId("dataCheck")}>
          <PropertyDataCheckPanel
            property={property}
            portfolio={store.portfolio}
            asOf={out.asOf}
            baseDate={baseDate}
            resetRate={assumptions.postFixationResetRatePa}
            onFix={(fix) =>
              isFormTarget(fix) ? setEditing(fix) : focusSection(sectionId(fix))
            }
          />
        </div>
      )}

      {/* Editable child entities */}
      <div className="pd-section" id={sectionId("records")}>
        <ValuationsPanel propertyId={propertyId} rows={valuations} />
        <LeasesPanel propertyId={propertyId} rows={leases} />
      </div>

      {/* The loan warnings sit with the blocks they describe (ADR 0107). */}
      <div className="pd-section" id={sectionId("financing")}>
        <MortgagesPanel propertyId={propertyId} rows={mortgages} />
        {warnings.map((w, i) => (
          <div
            className="banner warn"
            role="alert"
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
      {toast && <Toast message={toast} />}
    </AppShell>
  );
}
