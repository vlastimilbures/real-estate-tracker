import { Plus, Building2, Upload } from "lucide-react";
import { useUiStore } from "../../state/uiStore";
import { PageFrame } from "../components/PageFrame";
import { Button } from "../components/Button";
import { Panel, EmptyState } from "../components/layout";
import { PropertyFormModal } from "../components/PropertyFormModal";
import { SampleBanner } from "../components/SampleBanner";
import { ConfirmRow } from "../components/ConfirmRow";
import { usePropertiesTable } from "../hooks/usePropertiesTable";
import { usePropertyDialogs } from "../hooks/usePropertyDialogs";
import { useT } from "../hooks/useT";
import { BandLegend, PropertiesTable } from "./PropertiesTable";

/** No property yet: add one or import a CSV. */
function PropertiesEmpty({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  return (
    <EmptyState
      title={t.properties.emptyTitle}
      icon={Building2}
      action={
        <div className="row">
          <Button variant="primary" icon={Plus} onClick={onAdd}>
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
  );
}

export function Properties() {
  const t = useT();
  const { rows, total, subtitle } = usePropertiesTable();
  const openProperty = useUiStore((s) => s.openProperty);
  const d = usePropertyDialogs();
  const deleteTarget = rows.find((p) => p.propertyId === d.deletingId);

  return (
    <PageFrame
      title={t.properties.title}
      subtitle={subtitle}
      showLens={false}
      actions={
        <Button variant="primary" icon={Plus} onClick={() => d.setAdding(true)}>
          {t.properties.addProperty}
        </Button>
      }
    >
      <SampleBanner />
      {rows.length === 0 ? (
        <PropertiesEmpty onAdd={() => d.setAdding(true)} />
      ) : (
        <Panel flush>
          <PropertiesTable
            rows={rows}
            total={total}
            onOpen={(id) => {
              if (d.deletingId === id) return;
              openProperty(id);
            }}
            onEdit={d.setEditingId}
            onDelete={d.setDeletingId}
          />
          <BandLegend rows={rows} />
          {deleteTarget && (
            // Outside .table-wrap so the message is never clipped by the scroll.
            <ConfirmRow
              key={deleteTarget.propertyId}
              message={t.properties.confirmDelete(deleteTarget.name)}
              confirmLabel={t.common.yesDelete}
              busyLabel={t.common.deleting}
              onConfirm={() => d.handleDelete(deleteTarget.propertyId)}
              onCancel={() => d.setDeletingId(null)}
            />
          )}
        </Panel>
      )}

      {d.adding && (
        <PropertyFormModal mode="add" onClose={() => d.setAdding(false)} />
      )}
      {d.editingId !== null && (
        <PropertyFormModal
          mode="edit"
          propertyId={d.editingId}
          onClose={() => d.setEditingId(null)}
        />
      )}
    </PageFrame>
  );
}
