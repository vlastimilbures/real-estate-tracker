// The mortgage block's add/edit form (#490): the record form's state with the loan's
// row lists, the Standard | Development switch (ADR 0098), the event and tranche rows
// (ADR 0116 §11, ADR 0167), the instalment hint and its Calc button.
import type { EntityFormProps } from "../../components/EntityPanel";
import { RecordFormView } from "../../components/forms";
import {
  useRecordForm,
  type RecordFormWithLists,
} from "../../hooks/useRecordForm";
import { useT } from "../../hooks/useT";
import type { FormSpec } from "../../model/formParse";
import {
  EVENT_LISTS,
  type EventListKind,
  type EventLists,
} from "../../model/loanEventRows";
import {
  chosenLoanType,
  DEV_FIELDS,
  drawdownNotes,
  instalmentFill,
  loanTypeOf,
  mortgageDraft,
  suggestedInstalmentHint,
  type LoanType,
  type mortgageSpecs,
} from "../../model/mortgageForm";
import type { MortgageBlock } from "../../../engine";
import {
  LoanEventRows,
  type LeadBinding,
  type ListNotes,
} from "./LoanEventRows";
import { LoanTypeSwitch } from "./LoanTypeSwitch";

type Form = RecordFormWithLists<EventLists>;

export function MortgageForm({
  specs,
  row,
  submitLabel,
  unsavedKey,
  onCancel,
  onSubmit,
  successorNote,
}: EntityFormProps<MortgageBlock, ReturnType<typeof mortgageSpecs>> & {
  /** Adding a block to a property that has one (ADR 0098). */
  successorNote: boolean;
}) {
  const t = useT();
  const initial = mortgageDraft(row);
  const form = useRecordForm({
    specs,
    initial: initial.fields,
    lists: { initial: initial.lists, model: EVENT_LISTS },
    // A development loan shows the initial principal in its drawdown schedule.
    hiddenFields: (fields, lists) =>
      chosenLoanType(fields, lists.draws) === "development"
        ? ["initialPrincipal"]
        : DEV_FIELDS,
    unsavedKey,
    onSubmit,
  });
  const { draft, lists } = form;
  // Back to Standard drops the tranche rows and the completion date, also a blank row,
  // so a hidden row does not leave the form unsaved.
  const setType = (next: LoanType) =>
    next === "standard"
      ? form.patch({ loanType: next, completionDate: "" }, { draws: [] })
      : form.patch({ loanType: next });
  const list =
    (kind: EventListKind, notes: ListNotes | null) => (spec: FormSpec) => (
      <ListField form={form} spec={spec} kind={kind} notes={notes} />
    );
  return (
    <RecordFormView
      form={form}
      specs={specs}
      submitLabel={submitLabel}
      onCancel={onCancel}
      header={
        <LoanTypeSwitch
          type={chosenLoanType(draft, lists.draws)}
          dataType={loanTypeOf(draft, lists.draws)}
          onSet={setType}
          successorNote={successorNote}
        />
      }
      hint={suggestedInstalmentHint(t, draft, lists.draws)}
      actions={{ monthlyInstalment: instalmentFill(t, draft) }}
      slots={{
        draws: list("draws", drawdownNotes(t, draft, lists.draws)),
        prepayments: list("prepayments", null),
        recasts: list("recasts", null),
      }}
    />
  );
}

/** A row list, wide in the grid (ADR 0116 §11, ADR 0167). */
function ListField<K extends EventListKind>({
  form,
  spec,
  kind,
  notes,
}: {
  form: Form;
  spec: FormSpec;
  kind: K;
  notes: ListNotes | null;
}) {
  const { draft, errors } = form;
  const lead = spec.kind === "list" ? spec.lead : undefined;
  /** A row list's fixed first row, bound to its field in the draft (ADR 0167). */
  const binding: LeadBinding | undefined = lead && {
    ...lead,
    value: draft[lead.field] ?? "",
    date: draft[lead.dateField] ?? "",
    error: errors[lead.field],
    onChange: (v) => form.patch({ [lead.field]: v }),
  };
  return (
    <div className="form-wide">
      <LoanEventRows
        kind={kind}
        name={spec.name}
        label={spec.label}
        help={spec.help}
        rows={form.lists[kind]}
        errors={errors}
        notes={notes}
        lead={binding}
        onChange={(rows) => form.editList(kind, rows as EventLists[K])}
      />
    </div>
  );
}
