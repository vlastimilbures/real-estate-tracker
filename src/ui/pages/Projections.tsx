import { useState } from "react";
import { useAllProjections } from "../../state/useEngine";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { AppShell } from "../components/AppShell";
import { Panel, EmptyState, ExportXlsxButton } from "../components/primitives";
import { FolderOpen } from "lucide-react";
import { PropertySelect } from "../components/PropertySelect";
import { ProjectionGrid } from "../components/ProjectionGrid";
import {
  projectionSeries,
  projectionColumns,
  shortPropertyName,
} from "../model/projection";
import { projectionsSubtitle } from "../model/tableContext";
import { exportTableXlsx } from "../exportXlsx";
import { slug } from "../../lib/slug";
import { useT } from "../hooks/useT";
import { PortfolioStateNotice } from "../components/PortfolioStateNotice";
import { portfolioState } from "../model/portfolioState";

export function Projections() {
  const t = useT();
  const all = useAllProjections();
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const mode = useUiStore((s) => s.mode);
  const [entity, setEntity] = useState<string>("portfolio");

  if (!all || !assumptions) {
    return (
      <AppShell title={t.projections.title}>
        <EmptyState title={t.common.noPortfolioTitle} icon={FolderOpen}>
          {t.common.noPortfolioBody}
        </EmptyState>
      </AppShell>
    );
  }

  // No property, or none active: no table of zeros (ADR 0155).
  const state = portfolio ? portfolioState(portfolio) : null;
  if (state && state.kind !== "ready") {
    return (
      <AppShell title={t.projections.title} showLens={false}>
        <PortfolioStateNotice state={state} />
      </AppShell>
    );
  }

  const options = [
    { value: "portfolio", label: t.projections.portfolio },
    ...all.perProperty.map((p) => ({
      value: p.id,
      label: shortPropertyName(p.name),
    })),
  ];
  const selected =
    entity === "portfolio"
      ? all.portfolio
      : (all.perProperty.find((p) => p.id === entity)?.projection ??
        all.portfolio);
  const rows = projectionSeries(selected, mode, assumptions);
  const entityLabel =
    options.find((o) => o.value === entity)?.label ?? t.projections.portfolio;
  const lens =
    mode === "real" ? t.projections.realTerms : t.projections.nominalKc;
  const exportProjection = () =>
    exportTableXlsx({
      filename: `${slug(entityLabel)}-projection-${mode}.xlsx`,
      sheetName: t.xlsx.sheetNames.projection,
      columns: projectionColumns(t, assumptions.baseDate, rows),
      rows,
    });

  return (
    <AppShell
      title={t.projections.title}
      subtitle={projectionsSubtitle(t, mode, assumptions.baseDate)}
      actions={
        <PropertySelect
          mode="single"
          options={options}
          selected={entity}
          onChange={setEntity}
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
    </AppShell>
  );
}
