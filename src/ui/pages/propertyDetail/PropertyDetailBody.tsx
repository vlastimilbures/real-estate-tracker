import { InvalidDataNotice } from "../../components/InvalidDataNotice";
import { PropertyFormModal } from "../../components/PropertyFormModal";
import type { AsOfBounds } from "../../model/asOf";
import type { DataCheckFix } from "../../model/dataCheck";
import type { PropertyDetailView } from "../../model/propertyDetailView";
import type { PropertyFormTarget } from "../../model/sectionNav";
import type { usePropertyActivation } from "../../hooks/usePropertyActivation";
import type { PropertyRecords } from "../../model/propertyRecords";
import type {
  Assumptions,
  EngineInputError,
  HoldingCost,
  Portfolio,
  Property,
} from "../../../engine";
import type { MutationResult } from "../../../state/portfolioStore";
import { PropertyDataCheckPanel } from "../PropertyDataCheck";
import {
  LeasesPanel,
  MortgagesPanel,
  ValuationsPanel,
} from "../PropertyEntityPanels";
import { AcquisitionPanel } from "./AcquisitionPanel";
import { ActivationBanner } from "./ActivationBanner";
import { HoldingCostsPanel } from "./HoldingCostsPanel";
import { PdSection } from "./PdSection";
import { PropertyAmortizationPanel } from "./PropertyAmortizationPanel";
import { PropertyOverview } from "./PropertyOverview";
import { PropertyProjectionPanel } from "./PropertyProjectionPanel";

export interface PropertyDetailBodyProps {
  v: PropertyDetailView;
  property: Property;
  /** Stored data that breaks an engine rule: the records to fix, no figures. */
  invalid: EngineInputError | null;
  portfolio: Portfolio;
  assumptions: Assumptions;
  records: PropertyRecords;
  activation: ReturnType<typeof usePropertyActivation>;
  asOf: {
    value: Date | null;
    onChange: (date: Date | null) => void;
    bounds: AsOfBounds;
  };
  amortization: { open: boolean; onToggle: () => void };
  /** The open property form: plain, or at its Acquisition section. */
  editing: false | PropertyFormTarget;
  onCloseForm: () => void;
  onRecordFunding: (opener: HTMLElement) => void;
  onSaveHolding: (h: HoldingCost) => Promise<MutationResult>;
  onHoldingSaved: () => void;
  onFix: (fix: DataCheckFix) => void;
}

/** The page's sections in order (ADR 0107). The records, financing and holding costs
 *  show without figures too, so a record that breaks a rule can be fixed here. */
export function PropertyDetailBody(p: PropertyDetailBodyProps) {
  const { v, property, records, activation, assumptions } = p;
  const { body } = v;
  const propertyId = property.id;
  return (
    <>
      <ActivationBanner
        propertyName={property.name}
        isActive={property.active}
        confirmingDeactivate={activation.confirmingDeactivate}
        onConfirmDeactivate={activation.deactivate}
        onCancelDeactivate={() => activation.setConfirmingDeactivate(false)}
        error={activation.activeError}
      />

      {p.invalid && (
        <InvalidDataNotice error={p.invalid} portfolio={p.portfolio} />
      )}

      {body && (
        <PropertyOverview
          body={body}
          purchaseDate={property.purchaseDate}
          asOf={p.asOf.value}
          onAsOf={p.asOf.onChange}
          bounds={p.asOf.bounds}
        />
      )}

      {/* Editable child entities */}
      <PdSection section="records">
        <ValuationsPanel propertyId={propertyId} rows={records.valuations} />
        <LeasesPanel propertyId={propertyId} rows={records.leases} />
      </PdSection>

      {/* The loan warnings sit with the blocks they describe (ADR 0107). They are
          standing state, not news: a status, not an alert on every visit (ADR 0157). */}
      <PdSection section="financing">
        <MortgagesPanel propertyId={propertyId} rows={records.mortgages} />
        {v.warnings.map((w) => (
          <div className="banner warn" role="status" key={w.key}>
            {w.text}
          </div>
        ))}
      </PdSection>

      {body && (
        <PdSection section="acquisition">
          <AcquisitionPanel
            view={body.acquisition}
            onRecordFunding={p.onRecordFunding}
          />
        </PdSection>
      )}

      <PdSection section="holding">
        <HoldingCostsPanel
          holding={records.holding}
          propertyId={propertyId}
          defaults={assumptions.defaults}
          onSave={p.onSaveHolding}
          onSaved={p.onHoldingSaved}
        />
      </PdSection>

      {body && (
        <PropertyProjectionPanel body={body} baseDate={assumptions.baseDate} />
      )}

      {body?.amortization && (
        <PropertyAmortizationPanel
          amortization={body.amortization}
          exportSpec={body.amortizationExport}
          open={p.amortization.open}
          onToggle={p.amortization.onToggle}
        />
      )}

      {p.editing && (
        <PropertyFormModal
          mode="edit"
          propertyId={propertyId}
          openFunding={p.editing === "editFunding"}
          onClose={p.onCloseForm}
        />
      )}
      {/* Last: the findings point at the sections above (ADR 0223 §5). */}
      {body && v.check && (
        <PdSection section="dataCheck">
          <PropertyDataCheckPanel
            check={v.check}
            asOf={body.asOf}
            resetRate={assumptions.postFixationResetRatePa}
            onFix={p.onFix}
          />
        </PdSection>
      )}
    </>
  );
}
