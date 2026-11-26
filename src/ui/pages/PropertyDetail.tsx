import { useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePortfolioStore } from "../../state/portfolioStore";
import { usePropertyEngineResult } from "../../state/useEngine";
import { useUiStore } from "../../state/uiStore";
import { PageFrame } from "../components/PageFrame";
import { Button } from "../components/Button";
import { EmptyState } from "../components/layout";
import { SectionNav } from "../components/SectionNav";
import { focusSection } from "../focus";
import { useToast } from "../hooks/useToast";
import { useT } from "../hooks/useT";
import { useAsOf } from "../hooks/useAsOf";
import { useSectionSpy } from "../hooks/useSectionSpy";
import { usePropertyActivation } from "../hooks/usePropertyActivation";
import { propertyRecords } from "../model/propertyRecords";
import { reviewPill } from "../model/dataCheck";
import {
  detailSections,
  propertyDetailView,
  sectionLinks,
  splitResult,
} from "../model/propertyDetailView";
import type { Assumptions, Portfolio, Property } from "../../engine";
import {
  isFormTarget,
  sectionId,
  type PropertyFormTarget,
} from "../model/sectionNav";
import { PropertyDetailBody } from "./propertyDetail/PropertyDetailBody";
import { PropertyHeaderActions } from "./propertyDetail/PropertyHeaderActions";

/** The view state this page reads. */
function usePageUi() {
  return useUiStore(
    useShallow((s) => ({
      propertyId: s.selectedPropertyId,
      navigate: s.navigate,
      openSettings: s.openSettings,
      mode: s.mode,
      asOf: s.asOf,
      setAsOf: s.setAsOf,
      propertyTarget: s.propertyTarget,
      clearPropertyTarget: s.clearPropertyTarget,
      amortizationOpen: s.amortizationOpen,
      setAmortizationOpen: s.setAmortizationOpen,
    })),
  );
}

/** What the page needs to show a property, narrowed; null shows the fallback. The engine
 *  result is null for an unknown id, so a stale or deleted selection lands there too. */
function shownPage<V>(
  propertyId: string | null,
  property: Property | undefined,
  hasResult: boolean,
  {
    portfolio,
    assumptions,
  }: { portfolio: Portfolio | null; assumptions: Assumptions | null },
  view: V | null,
) {
  if (propertyId === null || !portfolio || !hasResult) return null;
  if (!property || !assumptions || !view) return null;
  return { property, portfolio, assumptions, view };
}

export function PropertyDetail() {
  const t = useT();
  // Only the fields this page reads, so an unrelated store change (error banner,
  // scenarios, status) does not re-render it.
  const ui = usePageUi();
  const { propertyId, propertyTarget, clearPropertyTarget } = ui;
  const store = usePortfolioStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      assumptions: s.assumptions,
      saveHoldingCost: s.saveHoldingCost,
    })),
  );
  // The date the tiles, picker and subtitle are for, clamped to the window (ADR 0150).
  const resolved = useAsOf();
  const result = usePropertyEngineResult(propertyId, resolved?.date ?? null);
  // Stored data that breaks an engine rule: show the records to fix, no figures.
  const { out, invalid } = splitResult(result);
  // The open property form: plain, or at its Acquisition section (a Data check link).
  const [editing, setEditing] = useState<false | PropertyFormTarget>(false);
  // Record funding's button leaves with the compact Acquisition line once something is
  // saved, so the dialog cannot hand focus back to it: land on the section instead
  // (ADR 0209 §2), not on whatever the dialog's fallback found in the panel (its "About
  // this", ADR 0214). Runs after the dialog's own focus return.
  const acquisitionOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const opener = acquisitionOpener.current;
    if (editing !== false || !opener) return;
    acquisitionOpener.current = null;
    if (!opener.isConnected) focusSection(sectionId("acquisition"));
  }, [editing]);
  const activation = usePropertyActivation(propertyId);
  const { showToast } = useToast();
  const records = propertyRecords(store.portfolio, propertyId);
  const found = store.portfolio?.properties.find((p) => p.id === propertyId);
  const isActive = found?.active !== false;
  // Computed before the early return so the spy hook runs on every render.
  const sections = detailSections(out, isActive);
  const [currentSection, setCurrentSection] = useSectionSpy(
    sections.map(sectionId),
  );
  // A Dashboard data check link lands on its section, or opens the property form, once
  // the page shows the property (ADR 0118). The form opens during render, as Properties'
  // ⌘N request does; the effect moves focus and clears the request.
  const shown = found !== undefined;
  if (isFormTarget(propertyTarget) && shown && !editing)
    setEditing(propertyTarget);
  useEffect(() => {
    if (!propertyTarget || !shown) return;
    if (!isFormTarget(propertyTarget)) focusSection(sectionId(propertyTarget));
    clearPropertyTarget();
  }, [propertyTarget, shown, clearPropertyTarget]);

  const page = shownPage(
    propertyId,
    found,
    out !== null || invalid !== null,
    store,
    resolved,
  );
  if (!page) {
    return (
      <PageFrame title={t.propertyDetail.fallbackTitle} showLens={false}>
        <EmptyState
          title={t.propertyDetail.noneSelectedTitle}
          icon={Building2}
          action={
            <Button onClick={() => ui.navigate("properties")}>
              {t.propertyDetail.backToProperties}
            </Button>
          }
        />
      </PageFrame>
    );
  }

  const { property, portfolio, assumptions, view } = page;
  const v = propertyDetailView({
    out,
    property,
    portfolio,
    assumptions,
    mortgages: records.mortgages,
    mode: ui.mode,
    view,
    t,
  });

  return (
    <PageFrame
      title={property.name}
      // No figures with invalid data, so nothing for the lens to switch (ADR 0265).
      showLens={invalid === null}
      attention={
        // The same pill as the Dashboard's (ADR 0218 §1, 0223 §5).
        reviewPill(t, v.toReview, () => focusSection(sectionId("dataCheck")))
      }
      subtitle={v.subtitle}
      crumb={{
        label: t.nav.properties,
        onSelect: () => ui.navigate("properties"),
      }}
      subnav={
        <SectionNav
          label={t.propertyDetail.sectionNavLabel}
          sections={sectionLinks(t, sections)}
          current={currentSection}
          onSelect={setCurrentSection}
        />
      }
      actions={
        <PropertyHeaderActions
          isActive={isActive}
          toggling={activation.toggling}
          onEdit={() => setEditing("edit")}
          onDeactivate={() => activation.setConfirmingDeactivate(true)}
          onActivate={activation.activate}
        />
      }
    >
      <PropertyDetailBody
        v={v}
        property={property}
        invalid={invalid}
        portfolio={portfolio}
        assumptions={assumptions}
        records={records}
        activation={activation}
        asOf={{ value: ui.asOf, onChange: ui.setAsOf, bounds: view.bounds }}
        amortization={{
          open: ui.amortizationOpen,
          onToggle: () => ui.setAmortizationOpen(!ui.amortizationOpen),
        }}
        editing={editing}
        onCloseForm={() => setEditing(false)}
        onRecordFunding={(opener) => {
          acquisitionOpener.current = opener;
          setEditing("editFunding");
        }}
        onSaveHolding={store.saveHoldingCost}
        onHoldingSaved={() => showToast(t.propertyDetail.holdingCostsSaved)}
        onFix={(fix) =>
          fix === "assumptions"
            ? ui.openSettings("assumptions")
            : isFormTarget(fix)
              ? setEditing(fix)
              : focusSection(sectionId(fix))
        }
      />
    </PageFrame>
  );
}
