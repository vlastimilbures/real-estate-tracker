import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { MutationResult } from "../../state/portfolioStore";
import { Panel, Button } from "./primitives";
import { RecordForm, type FieldActions } from "./forms";
import { EntityTable, DeleteConfirmRow } from "./EntityPanelParts";
import type { FieldSpec, ParsedValues } from "../model/formParse";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";

const newId = () => crypto.randomUUID();

/** Generic add/edit/delete panel for a property's child rows. `build` gets the form
 *  values typed by the inline `specs`. */
export function EntityPanel<
  T extends { id: string },
  const S extends readonly FieldSpec[],
>({
  title,
  hint,
  rows,
  columns,
  specs,
  draftOf,
  build,
  onAdd,
  onSave,
  onDelete,
  addLabel,
  computeHint,
  fieldActions,
  validate,
  formHeader,
  hiddenFields,
}: {
  title: string;
  hint?: string;
  rows: T[];
  columns: { head: string; cell: (r: T) => ReactNode; left?: boolean }[];
  specs: S;
  draftOf: (r: T | null) => Record<string, string>;
  build: (values: ParsedValues<S>, id: string) => T;
  onAdd: (r: T) => Promise<MutationResult>;
  onSave: (r: T) => Promise<MutationResult>;
  onDelete?: (id: string) => Promise<MutationResult>;
  addLabel: string;
  computeHint?: (draft: Record<string, string>) => string | null;
  fieldActions?: FieldActions<S>;
  /** Above the form's fields; `adding` is true for a new row (ADR 0098). */
  formHeader?: (
    draft: Record<string, string>,
    patch: (p: Record<string, string>) => void,
    adding: boolean,
  ) => ReactNode;
  hiddenFields?: (draft: Record<string, string>) => readonly string[];
  validate?: (
    values: ParsedValues<S>,
    draft: Record<string, string>,
  ) => Record<string, string>;
}) {
  const tr = useT();
  const [mode, setMode] = useState<
    | { t: "idle" }
    | { t: "add" }
    | { t: "edit"; id: string }
    | { t: "confirm-delete"; id: string; busy: boolean; error?: string }
  >({
    t: "idle",
  });

  const editingRow =
    mode.t === "edit" ? (rows.find((r) => r.id === mode.id) ?? null) : null;

  return (
    <Panel
      title={title}
      hint={hint}
      action={
        mode.t === "idle" ? (
          <Button size="sm" icon={Plus} onClick={() => setMode({ t: "add" })}>
            {addLabel}
          </Button>
        ) : undefined
      }
      flush
    >
      <EntityTable
        label={title}
        rows={rows}
        columns={columns}
        onDelete={onDelete}
        onEdit={(id) => setMode({ t: "edit", id })}
        onConfirmDelete={(id) =>
          setMode({ t: "confirm-delete", id, busy: false })
        }
      />

      {mode.t === "confirm-delete" && (
        <DeleteConfirmRow
          busy={mode.busy}
          error={mode.error}
          onConfirm={async () => {
            if (!onDelete) return;
            setMode({ t: "confirm-delete", id: mode.id, busy: true });
            const result = await onDelete(mode.id);
            // On failure keep the row open and say why, next to the buttons.
            if (result.ok) setMode({ t: "idle" });
            else
              setMode({
                t: "confirm-delete",
                id: mode.id,
                busy: false,
                error: describeWriteError(tr, result.error).message,
              });
          }}
          onCancel={() => setMode({ t: "idle" })}
        />
      )}

      {(mode.t === "add" || mode.t === "edit") && (
        <div
          style={{
            padding: "var(--s5)",
            borderTop: "1px solid var(--hairline)",
          }}
        >
          <RecordForm
            // Remount the form when the edit target changes so its draft re-seeds
            // from the new row; otherwise React keeps the previous row's `useState`
            // draft and a row-switch mid-edit saves one row's values onto another.
            key={mode.t === "edit" ? mode.id : "add"}
            specs={specs}
            initial={draftOf(editingRow)}
            submitLabel={
              mode.t === "add"
                ? `${tr.common.addVerb} ${addLabel}`
                : tr.common.saveChanges
            }
            onCancel={() => setMode({ t: "idle" })}
            computeHint={computeHint}
            fieldActions={fieldActions}
            validate={validate}
            header={
              formHeader &&
              ((draft, patch) => formHeader(draft, patch, mode.t === "add"))
            }
            hiddenFields={hiddenFields}
            onSubmit={async (values) => {
              const id = mode.t === "edit" ? mode.id : newId();
              const entity = build(values, id);
              const result =
                mode.t === "edit" ? await onSave(entity) : await onAdd(entity);
              // Keep the form open (preserving input) on failure, with the failure
              // shown in the form. Close only when the write actually landed.
              if (!result.ok) return result.error;
              setMode({ t: "idle" });
              return undefined;
            }}
          />
        </div>
      )}
    </Panel>
  );
}
