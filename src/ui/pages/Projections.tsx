import { useState } from "react";
import { useProjections } from "../../state/useEngine";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { PageFrame } from "../components/PageFrame";
import { Panel, EmptyState, ExportXlsxButton } from "../components/primitives";
import { FolderOpen } from "lucide-react";
import { PropertySelect } from "../components/PropertySelect";
import { ProjectionGrid } from "../components/ProjectionGrid";
import { projectionSeries } from "../model/projection";
import {
  lensLabel,
  projectionExport,
  projectionsPageSubtitle,
} from "../model/tableContext";
import { exportTableXlsx } from "../exportXlsx";
import { useT } from "../hooks/useT";
import { PortfolioStateNotice } from "../components/PortfolioStateNotice";
import { portfolioState } from "../model/portfolioState";

/** Property choices carry this prefix, so no property id can equal "portfolio" (ADR 0191). */
const PROPERTY = "property:";

export function Projections() {
  const t = useT();
  const all = useProjections();
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const mode = useUiStore((s) => s.mode);
  // The chosen property's id, or null for the whole portfolio (ADR 0242 §1).
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const active = (portfolio?.properties ?? []).filter(
    (p) => p.active !== false,
  );
  const property = active.find((p) => p.id === propertyId);
  // A choice no longer listed becomes the portfolio and stays so if it returns (ADR 0242 §1).
  if (propertyId !== null && !property) setPropertyId(null);

  if (!all || !assumptions) {
    return (
      <PageFrame title={t.projections.title}>
        <EmptyState title={t.common.noPortfolioTitle} icon={FolderOpen}>
          {t.common.noPortfolioBody}
        </EmptyState>
      </PageFrame>
    );
  }

  // No property, or none active: no table of zeros (ADR 0155).
  const state = portfolio ? portfolioState(portfolio) : null;
  if (state && state.kind !== "ready") {
    return (
      <PageFrame title={t.projections.title} showLens={false}>
        <PortfolioStateNotice state={state} />
      </PageFrame>
    );
  }

  const options = [
    { value: "portfolio", label: t.projections.portfolio },
    ...active.map((p) => ({ value: PROPERTY + p.id, label: p.name })),
  ];
  const selected =
    (property && all.byProperty.get(property.id)) ?? all.portfolio;
  const rows = projectionSeries(selected, mode, assumptions);
  const entityLabel = property?.name ?? t.projections.portfolio;
  const lens = lensLabel(t, mode);
  // The file names the property by its full name, as Property detail does (ADR 0159).
  const exportProjection = () =>
    exportTableXlsx(
      projectionExport(
        t,
        property ?? { name: t.projections.portfolio, id: "portfolio" },
        rows,
        mode,
        assumptions.baseDate,
      ),
    );

  return (
    <PageFrame
      title={t.projections.title}
      subtitle={projectionsPageSubtitle(t, mode, assumptions.baseDate)}
      actions={
        <PropertySelect
          mode="single"
          options={options}
          selected={property ? PROPERTY + property.id : "portfolio"}
          onChange={(value) =>
            setPropertyId(
              value.startsWith(PROPERTY) ? value.slice(PROPERTY.length) : null,
            )
          }
          ariaLabel={t.projections.entity}
        />
      }
    >
      <Panel
        title={entityLabel}
        hint={lens}
        action={<ExportXlsxButton onExport={exportProjection} />}
        flush
      >
        <ProjectionGrid rows={rows} baseDate={assumptions.baseDate} />
      </Panel>
    </PageFrame>
  );
}
