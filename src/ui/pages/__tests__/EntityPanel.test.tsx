// @vitest-environment jsdom
//
// Regression for the row-switch corruption bug: opening Edit on row A, then
// switching to Edit row B mid-edit, then saving must write B's own values — not
// A's. The fix is a `key` on the RecordForm inside EntityPanel that changes per
// edit target, forcing React to remount (and re-seed `useState`) the form.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntityPanel } from "../../components/EntityPanel";
import type { FieldSpec } from "../../model/formParse";

type Row = { id: string; value: string };

const specs: FieldSpec[] = [{ name: "value", label: "Value", kind: "money" }];

function renderPanel(onSave: (r: Row) => Promise<{ ok: true }>) {
  const rows: Row[] = [
    { id: "a", value: "100" },
    { id: "b", value: "200" },
  ];
  return render(
    <EntityPanel
      title="Rows"
      addLabel="row"
      rows={rows}
      columns={[{ head: "Value", left: true, cell: (r) => r.value }]}
      specs={specs}
      draftOf={(r) => ({ value: r ? r.value : "" })}
      build={(v, id): Row => ({
        id,
        value: String(v.value),
      })}
      onAdd={async () => ({ ok: true })}
      onSave={onSave}
    />,
  );
}

describe("EntityPanel row-switch", () => {
  it("saves the switched-to row's own values, not the first row's", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async (): Promise<{ ok: true }> => ({ ok: true }));
    renderPanel(onSave);

    // Open edit on row A, then switch to edit row B without leaving the form.
    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]); // row A
    await user.click(editButtons[1]); // row B
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ id: "b", value: "200" });
  });
});
