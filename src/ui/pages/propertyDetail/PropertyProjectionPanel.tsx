import { ExportXlsxButton, Panel } from "../../components/primitives";
import { ProjectionGrid } from "../../components/ProjectionGrid";
import { exportTableXlsx } from "../../exportXlsx";
import type { PropertyDetailBodyView } from "../../model/propertyDetailView";
import { PdSection } from "./PdSection";

/** The property's projection table under the lens, with its export. */
export function PropertyProjectionPanel({
  body,
  baseDate,
}: {
  body: PropertyDetailBodyView;
  baseDate: Date;
}) {
  const { projection } = body;
  return (
    <PdSection section="projection">
      <Panel
        title={projection.title}
        hint={projection.hint}
        action={
          <ExportXlsxButton
            onExport={() => exportTableXlsx(body.projectionExport)}
          />
        }
        flush
      >
        <ProjectionGrid rows={projection.rows} baseDate={baseDate} />
      </Panel>
    </PdSection>
  );
}
