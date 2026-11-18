// @vitest-environment jsdom
//
// ADR 0173 §2, kept by ADR 0253: after a confirmed delete lands, focus moves to the panel
// only when it was lost. Focus the user moved outside the panel while the delete ran stays
// where it is.
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntityPanel } from "../EntityPanel";
import type { FieldSpec } from "../../model/formParse";
import type { MutationResult } from "../../../state/portfolioStore";
import { deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

type Row = { id: string; value: string };
const specs: FieldSpec[] = [{ name: "value", label: "Value", kind: "money" }];
const ok = async (): Promise<MutationResult> => ({ ok: true });

function Page({ onDelete }: { onDelete: () => Promise<MutationResult> }) {
  return (
    <>
      <button type="button">Elsewhere</button>
      <EntityPanel
        title="Rows"
        addLabel="row"
        rows={[{ id: "a", value: "100" }]}
        columns={[{ head: "Value", left: true, cell: (r) => r.value }]}
        specs={specs}
        draftOf={(r) => ({ value: r ? r.value : "" })}
        build={(v, id): Row => ({ id, value: String(v.value) })}
        onAdd={ok}
        onSave={ok}
        onDelete={onDelete}
      />
    </>
  );
}

describe("focus after a landed delete (ADR 0173 §2)", () => {
  it("stays on a control outside the panel the user moved to while it ran", async () => {
    const write = deferred<MutationResult>();
    render(<Page onDelete={() => write.promise} />);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => write.resolve({ ok: true }));
    expect(
      screen.queryByRole("button", { name: en.common.yesDelete }),
    ).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("moves to the panel when focus was lost while it ran", async () => {
    const write = deferred<MutationResult>();
    render(<Page onDelete={() => write.promise} />);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    const yes = screen.getByRole("button", { name: en.common.yesDelete });
    await userEvent.click(yes);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => yes.blur());
    await act(async () => write.resolve({ ok: true }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Rows" }).closest("section"),
    );
  });
});
