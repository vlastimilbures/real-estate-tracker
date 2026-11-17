// @vitest-environment jsdom
//
// ADR 0246 (#538): the submit button disables while the save runs, which drops its focus
// to <body>. After a failed save the form puts focus back on it, unless the user moved it.
import { describe, it, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../forms";
import type { FieldSpec } from "../../model/formParse";
import type { WriteError } from "../../../state/writeError";

const specs: FieldSpec[] = [{ name: "amount", label: "Amount", kind: "money" }];
const failure: WriteError = { kind: "other", message: "Disk full" };

/** A form whose save waits until `finish` settles it. */
function renderForm() {
  let finish: (r: WriteError | undefined) => void = () => undefined;
  render(
    <>
      <RecordForm
        specs={specs}
        initial={{ amount: "100" }}
        submitLabel="Save"
        onSubmit={() =>
          new Promise<WriteError | undefined>((resolve) => (finish = resolve))
        }
      />
      <button type="button">Elsewhere</button>
    </>,
  );
  return { finish: (r: WriteError | undefined) => finish(r) };
}

const save = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });

describe("RecordForm focus after a failed save (ADR 0246)", () => {
  it("puts focus back on Save after the fixup dropped it to <body>", async () => {
    const { finish } = renderForm();
    await userEvent.click(save());
    expect(save()).toHaveProperty("disabled", true);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => save().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => finish(failure));
    expect(screen.getByRole("alert").textContent).toContain("Disk full");
    expect(document.activeElement).toBe(save());
  });

  it("leaves focus where the user moved it during the save", async () => {
    const { finish } = renderForm();
    await userEvent.click(save());
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => finish(failure));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("keeps focus in the field a save started from by Return", async () => {
    const { finish } = renderForm();
    const field = screen.getByLabelText("Amount", { exact: false });
    await userEvent.click(field);
    await userEvent.keyboard("{Enter}");
    expect(save()).toHaveProperty("disabled", true);
    await act(async () => finish(failure));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(field);
  });
});
