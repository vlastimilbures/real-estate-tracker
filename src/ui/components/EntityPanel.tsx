import { useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { MutationResult } from "../../state/portfolioStore";
import { Panel, Button } from "./primitives";
import { RecordForm } from "./forms";
import { EntityTable } from "./EntityPanelParts";
import { ConfirmRow } from "./ConfirmRow";
import type { FormSpec, ParsedValues } from "../model/formParse";
import { useT } from "../hooks/useT";
import { useUiStore } from "../../state/uiStore";
import type { WriteError } from "../../state/writeError";

const newId = () => crypto.randomUUID();

type Draft = Record<string, string>;

/** The panel around the table: its heading and the add button's label. */
export interface PanelChrome {
  title: string;
  hint?: string;
  /** The panel's explanation, leading its body (ADR 0214). */
  help?: ReactNode;
  /** A definition behind the info icon after the title (ADR 0217). */
  info?: string;
  addLabel: string;
}

/** The rows, their columns and their delete. */
export interface PanelTable<T> {
  rows: T[];
  columns: { head: string; cell: (r: T) => ReactNode; left?: boolean }[];
  onDelete?: (id: string) => Promise<MutationResult>;
  /** Names a row in its delete confirm (ADR 0143); defaults to "Delete this record?". */
  describe?: (row: T) => string;
}

/** What a panel's add or edit form gets: the row (null when adding) and the save. */
export interface EntityFormProps<T, S extends readonly FormSpec[]> {
  specs: S;
  row: T | null;
  adding: boolean;
  submitLabel: string;
  unsavedKey: string;
  onCancel: () => void;
  onSubmit: (values: ParsedValues<S>) => Promise<WriteError | undefined>;
}

/** The add/edit form: its specs, the draft of a row and the row built from the values.
 *  A form of its own (`render`, the mortgage form) takes the place of RecordForm. */
export interface PanelForm<T, S extends readonly FormSpec[]> {
  specs: S;
  /** RecordForm's draft of a row (null when adding); blank without it. */
  draftOf?: (r: T | null) => Draft;
  build: (values: ParsedValues<S>, id: string) => T;
  onAdd: (r: T) => Promise<MutationResult>;
  onSave: (r: T) => Promise<MutationResult>;
  render?: (props: EntityFormProps<T, S>) => ReactNode;
}

type Mode =
  | { t: "idle" }
  | { t: "add" }
  | { t: "edit"; id: string }
  | { t: "confirm-delete"; id: string };

/** Generic add/edit/delete panel for a property's child rows. `build` gets the form
 *  values typed by the inline `specs`. */
export function EntityPanel<
  T extends { id: string },
  const S extends readonly FormSpec[],
>({
  chrome,
  table,
  form,
}: {
  chrome: PanelChrome;
  table: PanelTable<T>;
  form: PanelForm<T, S>;
}) {
  const tr = useT();
  const { title, addLabel } = chrome;
  const { rows, onDelete, describe } = table;
  // The form's leave-guard key: a row's Edit or Delete asks first while this form holds
  // unsaved edits, and only this form's (ADR 0142).
  const formSource = useId();
  const guardedAction = useUiStore((s) => s.guardedAction);
  const [mode, setMode] = useState<Mode>({ t: "idle" });

  const deletingRow =
    mode.t === "confirm-delete"
      ? rows.find((r) => r.id === mode.id)
      : undefined;

  return (
    <Panel
      title={title}
      hint={chrome.hint}
      help={chrome.help}
      info={chrome.info}
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
        columns={table.columns}
        onDelete={onDelete}
        onEdit={(id) => {
          // The row already open stays as it is: nothing to switch, nothing to drop.
          if (mode.t === "edit" && mode.id === id) return;
          guardedAction(formSource, () => setMode({ t: "edit", id }));
        }}
        onConfirmDelete={(id) =>
          guardedAction(formSource, () => setMode({ t: "confirm-delete", id }))
        }
      />

      {mode.t === "confirm-delete" && onDelete && (
        <ConfirmRow
          key={mode.id}
          message={
            deletingRow && describe
              ? describe(deletingRow)
              : tr.common.confirmDeleteRow
          }
          confirmLabel={tr.common.yesDelete}
          busyLabel={tr.common.deleting}
          onConfirm={async () => {
            const result = await onDelete(mode.id);
            // Row actions are disabled while the delete runs, so nothing else opened
            // meanwhile (ADR 0253).
            if (result.ok) setMode({ t: "idle" });
            return result;
          }}
          onCancel={() => setMode({ t: "idle" })}
        />
      )}

      {(mode.t === "add" || mode.t === "edit") && (
        <div className="entity-form">
          <EntityForm
            // Remount the form when the edit target changes so its draft re-seeds
            // from the new row; otherwise React keeps the previous row's `useState`
            // draft and a row-switch mid-edit saves one row's values onto another.
            key={mode.t === "edit" ? mode.id : "add"}
            form={form}
            editId={mode.t === "edit" ? mode.id : null}
            rows={rows}
            addLabel={addLabel}
            unsavedKey={formSource}
            onClose={() => setMode({ t: "idle" })}
          />
        </div>
      )}
    </Panel>
  );
}

/** The add form (`editId` null) or the edit form of one row. */
function EntityForm<T extends { id: string }, S extends readonly FormSpec[]>({
  form,
  editId,
  rows,
  addLabel,
  unsavedKey,
  onClose,
}: {
  form: PanelForm<T, S>;
  editId: string | null;
  rows: T[];
  addLabel: string;
  unsavedKey: string;
  onClose: () => void;
}) {
  const tr = useT();
  const adding = editId === null;
  const row =
    editId === null ? null : (rows.find((r) => r.id === editId) ?? null);
  const props: EntityFormProps<T, S> = {
    specs: form.specs,
    row,
    adding,
    submitLabel: adding ? addLabel : tr.common.saveChanges,
    unsavedKey,
    onCancel: onClose,
    onSubmit: async (values) => {
      const id = editId ?? newId();
      const entity = form.build(values, id);
      const result = adding
        ? await form.onAdd(entity)
        : await form.onSave(entity);
      // Keep the form open (preserving input) on failure, with the failure
      // shown in the form. Close only when the write actually landed.
      if (!result.ok) return result.error;
      // Row actions are disabled while the save runs, so this is still the form
      // that saved (ADR 0253).
      onClose();
      return undefined;
    },
  };
  if (form.render) return form.render(props);
  return (
    <RecordForm
      unsavedKey={unsavedKey}
      specs={form.specs}
      initial={form.draftOf?.(row) ?? {}}
      submitLabel={props.submitLabel}
      onCancel={onClose}
      onSubmit={props.onSubmit}
    />
  );
}
