import { DisclosureButton } from "../../components/Disclosure";
import { ExportXlsxButton } from "../../components/ExportXlsxButton";
import { Panel } from "../../components/layout";
import { exportTableXlsx } from "../../exportXlsx";
import type { PropertyDetailBodyView } from "../../model/propertyDetailView";
import { useT } from "../../hooks/useT";
import { AmortizationTable } from "./AmortizationTable";
import { PdSection } from "./PdSection";

const AMORTIZATION_BODY = "pd-amortization-table";

/** The monthly schedule, collapsed by default; the header and its export stay
 *  (ADR 0107). */
export function PropertyAmortizationPanel({
  amortization,
  exportSpec,
  open,
  onToggle,
}: {
  amortization: NonNullable<PropertyDetailBodyView["amortization"]>;
  exportSpec: PropertyDetailBodyView["amortizationExport"];
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const { months, schedule } = amortization;
  return (
    <PdSection section="amortization">
      <Panel
        title={t.propertyDetail.amortizationTitle}
        hint={t.propertyDetail.amortizationMonths(months)}
        action={
          // The toggle sits in the head, before the export (ADR 0203 §2).
          <span className="panel-actions">
            <DisclosureButton
              open={open}
              controls={AMORTIZATION_BODY}
              onToggle={onToggle}
            >
              {open
                ? t.propertyDetail.hideAmortization
                : t.propertyDetail.showAmortization(months)}
            </DisclosureButton>
            <ExportXlsxButton onExport={() => exportTableXlsx(exportSpec)} />
          </span>
        }
        flush
      >
        <div id={AMORTIZATION_BODY} hidden={!open}>
          {open && <AmortizationTable schedule={schedule} />}
        </div>
      </Panel>
    </PdSection>
  );
}
