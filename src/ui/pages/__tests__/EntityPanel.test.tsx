// @vitest-environment jsdom
//
// Row switch in a record panel. A `key` on the RecordForm per edit target remounts the
// form, so a switch never saves one row's values onto another. Typed edits are not
// dropped by a click on another row's Edit or Delete: the leave guard asks first, and
// only for the panel's own form (ADR 0142, #132 R5-01, R5-19).
import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntityPanel } from "../../components/EntityPanel";
import { LeaveGuard } from "../../components/LeaveGuard";
import type { FieldSpec } from "../../model/formParse";
import { useUiStore } from "../../../state/uiStore";
import type { MutationResult } from "../../../state/portfolioStore";
import { en } from "../../../i18n/en";

type Row = { id: string; value: string };

const specs: FieldSpec[] = [{ name: "value", label: "Value", kind: "money" }];

const ok = async (): Promise<MutationResult> => ({ ok: true });

type Write<A> = (a: A) => Promise<MutationResult>;

function Panel({
  title,
  onSave = ok,
  onAdd = ok,
  onDelete = ok,
}: {
  title: string;
  onSave?: Write<Row>;
  onAdd?: Write<Row>;
  onDelete?: Write<string>;
}) {
  const rows: Row[] = [
    { id: "a", value: "100" },
    { id: "b", value: "200" },
  ];
  return (
    <EntityPanel
      chrome={{
        title,
        addLabel: "Add row",
      }}
      table={{
        rows,
        columns: [{ head: "Value", left: true, cell: (r) => r.value }],
        onDelete,
      }}
      form={{
        specs,
        draftOf: (r) => ({ value: r ? r.value : "" }),
        build: (v, id): Row => ({
          id,
          value: String(v.value),
        }),
        onAdd,
        onSave,
      }}
    />
  );
}

function renderPanel(
  onSave: Write<Row> = ok,
  writes: { onAdd?: Write<Row>; onDelete?: Write<string> } = {},
) {
  return render(
    <>
      <Panel title="Rows" onSave={onSave} {...writes} />
      <LeaveGuard />
    </>,
  );
}

/** A write that resolves only when the test says so. */
function deferred() {
  let finish: (r: MutationResult) => void = () => undefined;
  const promise = new Promise<MutationResult>((r) => (finish = r));
  return { write: () => promise, finish: (r: MutationResult) => finish(r) };
}

const editButtons = () => screen.getAllByRole("button", { name: "Edit" });
const deleteButtons = () =>
  screen.getAllByRole("button", { name: en.common.delete });
const valueInputs = () =>
  screen.getAllByRole<HTMLInputElement>("textbox", { name: "Value" });
const guard = () => screen.queryByRole("dialog");

describe("EntityPanel row-switch", () => {
  it("saves the switched-to row's own values, not the first row's", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(ok);
    renderPanel(onSave);

    // Open edit on row A, then switch to edit row B without typing: nothing to lose.
    await user.click(editButtons()[0]); // row A
    await user.click(editButtons()[1]); // row B
    expect(guard()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ id: "b", value: "200" });
  });

  it("asks before a row switch drops typed edits (#132)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(editButtons()[0]);
    await user.clear(valueInputs()[0]);
    await user.type(valueInputs()[0], "150");
    await user.click(editButtons()[1]);
    expect(guard()).not.toBeNull();
    expect(screen.getByText(en.common.unsavedTitle)).toBeTruthy();
  });

  it("asks before a delete drops typed edits (#132)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(editButtons()[0]);
    await user.type(valueInputs()[0], "5");
    await user.click(deleteButtons()[1]);
    expect(guard()).not.toBeNull();
    expect(screen.queryByText(en.common.confirmDeleteRow)).toBeNull();
    expect(valueInputs()[0].value).toBe("1005");
  });

  it("Edit on the row being edited does nothing; its edits stay guarded (#132)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(editButtons()[0]);
    await user.type(valueInputs()[0], "5");
    await user.click(editButtons()[0]);
    expect(guard()).toBeNull();
    expect(valueInputs()[0].value).toBe("1005");
    expect(useUiStore.getState().unsavedSources).toHaveLength(1);
  });

  it("Keep editing keeps the draft; Discard switches rows (#132)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(ok);
    renderPanel(onSave);
    await user.click(editButtons()[0]);
    await user.clear(valueInputs()[0]);
    await user.type(valueInputs()[0], "150");

    await user.click(editButtons()[1]);
    await user.click(
      screen.getByRole("button", { name: en.common.keepEditing }),
    );
    expect(guard()).toBeNull();
    expect(valueInputs()[0].value).toBe("150");

    await user.click(editButtons()[1]);
    await user.click(
      screen.getByRole("button", { name: en.common.discardChanges }),
    );
    expect(guard()).toBeNull();
    expect(valueInputs()[0].value).toBe("200");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith({ id: "b", value: "200" });
  });

  it("a dirty form in another panel does not ask", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Panel title="First" />
        <Panel title="Second" />
        <LeaveGuard />
      </>,
    );
    await user.click(editButtons()[0]); // First, row A
    await user.type(valueInputs()[0], "5");
    await user.click(editButtons()[2]); // Second, row A
    expect(guard()).toBeNull();
    expect(valueInputs()).toHaveLength(2);
    expect(valueInputs()[0].value).toBe("1005");
  });

  it("Discard in one panel keeps another panel's unsaved flag (#132)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Panel title="First" />
        <Panel title="Second" />
        <LeaveGuard />
      </>,
    );
    await user.click(editButtons()[0]); // First, row A
    await user.type(valueInputs()[0], "5");
    await user.click(editButtons()[2]); // Second, row A
    await user.type(valueInputs()[1], "7");
    expect(useUiStore.getState().unsavedSources).toHaveLength(2);

    await user.click(editButtons()[3]); // Second, row B
    expect(guard()).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: en.common.discardChanges }),
    );
    expect(valueInputs()[0].value).toBe("1005");
    expect(useUiStore.getState().unsavedSources).toHaveLength(1);
    expect(useUiStore.getState().unsavedChanges).toBe(true);
  });
});

// #248 (ADR 0173): a delete that lands closes the confirm, even one opened again
// meanwhile. In the app the row actions are disabled while it runs (ADR 0253); this
// panel's write is a stub, so they stay enabled here.
describe("EntityPanel: a late write closes only its own row", () => {
  // A delete is different: once it lands the row is gone, so a confirm for that same row
  // opened again meanwhile names nothing and closes with it.
  it("a delete of row A closes A's confirm opened again meanwhile", async () => {
    const user = userEvent.setup();
    const del = deferred();
    renderPanel(ok, { onDelete: del.write });
    await user.click(deleteButtons()[0]);
    await user.click(screen.getByRole("button", { name: en.common.yesDelete }));
    await user.click(deleteButtons()[1]);
    await user.click(deleteButtons()[0]);
    await act(async () => del.finish({ ok: true }));
    expect(
      screen.queryByRole("button", { name: en.common.yesDelete }),
    ).toBeNull();
  });
});
