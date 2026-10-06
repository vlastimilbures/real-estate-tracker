import { useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { MutationResult } from "../../state/portfolioStore";
import { Panel, Button } from "./primitives";
import { RecordForm, type FieldActions } from "./forms";
import { EntityTable, ConfirmRow } from "./EntityPanelParts";
import type { FieldSpec, ParsedValues } from "../model/formParse";
import { useT } from "../hooks/useT";
import { Modal } from "./Modal";
import { useUiStore } from "../../state/uiStore";

const newId = () => crypto.randomUUID();

/** A question asked before a new row is added (ADR 0099). `onConfirm` writes the row
 *  the confirmed way; "keep" writes it with the panel's plain `onAdd`. */
export interface AddPrompt<T> {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  keepLabel: string;
  onConfirm: (r: T) => Promise<MutationResult>;
}

type AddChoice = "confirm" | "keep" | "cancel";

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
  describe,
  addLabel,
  computeHint,
  fieldActions,
  validate,
  formHeader,
  hiddenFields,
  confirmAdd,
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
  /** Names a row in its delete confirm (ADR 0143); defaults to "Delete this record?". */
  describe?: (row: T) => string;
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
  /** Asked before an add (not an edit) when it returns a prompt. Closing the dialog
   *  adds nothing and keeps the form open. */
  confirmAdd?: (r: T) => AddPrompt<T> | null;
}) {
  const tr = useT();
  // The form's leave-guard key: a row's Edit or Delete asks first while this form holds
  // unsaved edits, and only this form's (ADR 0142).
  const formSource = useId();
  const guardedAction = useUiStore((s) => s.guardedAction);
  const [mode, setMode] = useState<
    | { t: "idle" }
    | { t: "add" }
    | { t: "edit"; id: string }
    | { t: "confirm-delete"; id: string }
  >({
    t: "idle",
  });

  const [asking, setAsking] = useState<{
    prompt: AddPrompt<T>;
    answer: (c: AddChoice) => void;
  } | null>(null);

  const editingRow =
    mode.t === "edit" ? (rows.find((r) => r.id === mode.id) ?? null) : null;
  const deletingRow =
    mode.t === "confirm-delete"
      ? rows.find((r) => r.id === mode.id)
      : undefined;

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
            if (result.ok) setMode({ t: "idle" });
            return result;
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
            unsavedKey={formSource}
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
              const prompt = mode.t === "add" ? confirmAdd?.(entity) : null;
              let choice: AddChoice = "keep";
              if (prompt) {
                choice = await new Promise<AddChoice>((answer) =>
                  setAsking({ prompt, answer }),
                );
                setAsking(null);
                if (choice === "cancel") return undefined;
              }
              const result =
                mode.t === "edit"
                  ? await onSave(entity)
                  : prompt && choice === "confirm"
                    ? await prompt.onConfirm(entity)
                    : await onAdd(entity);
              // Keep the form open (preserving input) on failure, with the failure
              // shown in the form. Close only when the write actually landed.
              if (!result.ok) return result.error;
              setMode({ t: "idle" });
              return undefined;
            }}
          />
        </div>
      )}

      {asking && (
        <Modal
          titleId="add-prompt-title"
          title={asking.prompt.title}
          onClose={() => asking.answer("cancel")}
          closeLabel={tr.common.close}
          footer={
            <>
              <Button onClick={() => asking.answer("keep")}>
                {asking.prompt.keepLabel}
              </Button>
              <Button
                variant="primary"
                onClick={() => asking.answer("confirm")}
              >
                {asking.prompt.confirmLabel}
              </Button>
            </>
          }
        >
          <p>{asking.prompt.message}</p>
        </Modal>
      )}
    </Panel>
  );
}
