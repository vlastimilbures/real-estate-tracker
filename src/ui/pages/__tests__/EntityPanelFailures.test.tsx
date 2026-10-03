// @vitest-environment jsdom
//
// UX-050 (DR-058): a failed delete keeps the confirm row open and says why, next to the
// buttons; a refused save keeps the form open with the reason in the form.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntityPanel } from "../../components/EntityPanel";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { FieldSpec } from "../../model/formParse";
import type { MutationResult } from "../../../state/portfolioStore";

type Row = { id: string; value: string };
const specs: FieldSpec[] = [{ name: "value", label: "Value", kind: "money" }];
const gone: MutationResult = {
  ok: false,
  error: { kind: "data", code: "ROW_MISSING", details: ["leases a"] },
};

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

function renderPanel(result: MutationResult) {
  render(
    <EntityPanel
      title="Rows"
      addLabel="row"
      rows={[{ id: "a", value: "100" }]}
      columns={[{ head: "Value", left: true, cell: (r) => r.value }]}
      specs={specs}
      draftOf={(r) => ({ value: r ? r.value : "" })}
      build={(v, id): Row => ({
        id,
        value: String(v.value),
      })}
      onAdd={async () => result}
      onSave={async () => result}
      onDelete={async () => result}
    />,
  );
}

describe("EntityPanel failures show next to the action", () => {
  it("a failed delete keeps the confirm row with the reason", async () => {
    const user = userEvent.setup();
    renderPanel(gone);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(screen.getByRole("alert").textContent).toBe(
      getDict("en").dataErrors.ROW_MISSING,
    );
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeTruthy();
  });

  it("a refused save keeps the form open with the reason", async () => {
    const user = userEvent.setup();
    renderPanel(gone);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert").textContent).toBe(
      getDict("en").dataErrors.ROW_MISSING,
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });
});
