// @vitest-environment jsdom
//
// Row switch in a record panel. A `key` on the RecordForm per edit target remounts the
// form, so a switch never saves one row's values onto another. Typed edits are not
// dropped by a click on another row's Edit or Delete: the leave guard asks first, and
// only for the panel's own form (ADR 0142, #132 R5-01, R5-19).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntityPanel } from "../../components/EntityPanel";
import { LeaveGuard } from "../../components/LeaveGuard";
import type { FieldSpec } from "../../model/formParse";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";

type Row = { id: string; value: string };

const specs: FieldSpec[] = [{ name: "value", label: "Value", kind: "money" }];

const ok = async (): Promise<{ ok: true }> => ({ ok: true });

function Panel({
  title,
  onSave = ok,
}: {
  title: string;
  onSave?: (r: Row) => Promise<{ ok: true }>;
}) {
  const rows: Row[] = [
    { id: "a", value: "100" },
    { id: "b", value: "200" },
  ];
  return (
    <EntityPanel
      title={title}
      addLabel="row"
      rows={rows}
      columns={[{ head: "Value", left: true, cell: (r) => r.value }]}
      specs={specs}
      draftOf={(r) => ({ value: r ? r.value : "" })}
      build={(v, id): Row => ({
        id,
        value: String(v.value),
      })}
      onAdd={ok}
      onSave={onSave}
      onDelete={ok}
    />
  );
}

function renderPanel(onSave: (r: Row) => Promise<{ ok: true }> = ok) {
  return render(
    <>
      <Panel title="Rows" onSave={onSave} />
      <LeaveGuard />
    </>,
  );
}

const editButtons = () => screen.getAllByRole("button", { name: "Edit" });
const deleteButtons = () =>
  screen.getAllByRole("button", { name: en.common.delete });
const valueInputs = () =>
  screen.getAllByRole<HTMLInputElement>("textbox", { name: "Value" });
const guard = () => screen.queryByRole("dialog");

beforeEach(() =>
  act(() =>
    useUiStore.setState({
      language: "en",
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    }),
  ),
);

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

  it.fails("asks before a row switch drops typed edits (#132)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(editButtons()[0]);
    await user.clear(valueInputs()[0]);
    await user.type(valueInputs()[0], "150");
    await user.click(editButtons()[1]);
    expect(guard()).not.toBeNull();
    expect(screen.getByText(en.common.unsavedTitle)).toBeTruthy();
  });

  it.fails("asks before a delete drops typed edits (#132)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(editButtons()[0]);
    await user.type(valueInputs()[0], "5");
    await user.click(deleteButtons()[1]);
    expect(guard()).not.toBeNull();
    expect(screen.queryByText(en.common.confirmDeleteRow)).toBeNull();
    expect(valueInputs()[0].value).toBe("1005");
  });

  it.fails(
    "Keep editing keeps the draft; Discard switches rows (#132)",
    async () => {
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
    },
  );

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

  it.fails(
    "Discard in one panel keeps another panel's unsaved flag (#132)",
    async () => {
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
    },
  );
});
