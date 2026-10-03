// @vitest-environment jsdom
//
// ADR 0099: EntityPanel's `confirmAdd` asks before an add. "End previous" writes
// through the prompt, "Keep as is" through the plain onAdd, and closing the dialog
// writes nothing and keeps the form. Edits never ask.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntityPanel, type AddPrompt } from "../../components/EntityPanel";
import type { FieldSpec } from "../../model/formParse";

type Row = { id: string; value: string };
type Ok = { ok: true };

const specs: FieldSpec[] = [{ name: "value", label: "Value", kind: "money" }];

function setup(ask: boolean) {
  const onAdd = vi.fn<(r: Row) => Promise<Ok>>(async () => ({ ok: true }));
  const onSave = vi.fn<(r: Row) => Promise<Ok>>(async () => ({ ok: true }));
  const onConfirm = vi.fn<(r: Row) => Promise<Ok>>(async () => ({ ok: true }));
  const confirmAdd = vi.fn((): AddPrompt<Row> | null =>
    ask
      ? {
          title: "End the previous row?",
          message: "Row a has no end.",
          confirmLabel: "End previous",
          keepLabel: "Keep as is",
          onConfirm,
        }
      : null,
  );
  render(
    <EntityPanel
      title="Rows"
      addLabel="row"
      rows={[{ id: "a", value: "100" }]}
      columns={[{ head: "Value", left: true, cell: (r) => r.value }]}
      specs={specs}
      draftOf={(r) => ({ value: r ? r.value : "" })}
      build={(v, id): Row => ({ id, value: String(v.value) })}
      onAdd={onAdd}
      onSave={onSave}
      confirmAdd={confirmAdd}
    />,
  );
  return { onAdd, onSave, onConfirm, confirmAdd };
}

async function submitNew(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "row" }));
  await user.type(screen.getByLabelText(/Value/), "200");
  await user.click(screen.getByRole("button", { name: /add row/i }));
}

describe("EntityPanel confirmAdd (ADR 0099)", () => {
  it("End previous writes through the prompt", async () => {
    const user = userEvent.setup();
    const { onAdd, onConfirm } = setup(true);
    await submitNew(user);
    expect(screen.getByRole("dialog").textContent).toContain(
      "Row a has no end.",
    );
    await user.click(screen.getByRole("button", { name: "End previous" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0].value).toBe("200");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Keep as is writes through the plain add", async () => {
    const user = userEvent.setup();
    const { onAdd, onConfirm } = setup(true);
    await submitNew(user);
    await user.click(screen.getByRole("button", { name: "Keep as is" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closing the dialog writes nothing and keeps the input", async () => {
    const user = userEvent.setup();
    const { onAdd, onConfirm } = setup(true);
    await submitNew(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText(/Value/) as HTMLInputElement).value,
    ).toContain("200");
  });

  it("adds without a dialog when there is nothing to ask", async () => {
    const user = userEvent.setup();
    const { onAdd } = setup(false);
    await submitNew(user);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("never asks on edit", async () => {
    const user = userEvent.setup();
    const { onSave, confirmAdd } = setup(true);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(confirmAdd).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
