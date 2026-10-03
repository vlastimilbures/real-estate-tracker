// @vitest-environment jsdom
//
// RecordForm's optional hooks: typed values to onSubmit (ADR 0074), cross-field
// `validate`, the live `computeHint` and inline `fieldActions` buttons.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../forms";
import { useUiStore } from "../../../state/uiStore";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

function renderForm(onSubmit = vi.fn()) {
  render(
    <RecordForm
      specs={[
        { name: "principal", label: "Principal", kind: "money" },
        { name: "term", label: "Term", kind: "int", optional: true },
      ]}
      initial={{ principal: "1000", term: "" }}
      submitLabel="Save"
      onSubmit={onSubmit}
      validate={(v): Record<string, string> =>
        v.term === null && v.principal.greaterThan(5000)
          ? { term: "Term needed above 5000" }
          : {}
      }
      computeHint={(draft) =>
        draft.principal ? `Hint for ${draft.principal}` : null
      }
      fieldActions={{
        principal: (draft) =>
          draft.term
            ? { label: "Fill", patch: { principal: "9000" } }
            : { label: "Fill", title: "Enter a term first" },
        term: () => null,
      }}
    />,
  );
  return onSubmit;
}

describe("RecordForm options", () => {
  it("passes the parsed values typed by the specs", async () => {
    const onSubmit = renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [values] = onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(String(values.principal)).toBe("1000");
    expect(values.term).toBeNull();
  });

  it("shows a cross-field error from validate and does not submit", async () => {
    const onSubmit = renderForm();
    const principal = screen.getByLabelText(/Principal/);
    await userEvent.clear(principal);
    await userEvent.type(principal, "6000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Term needed above 5000")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the live hint and a field action that patches the draft", async () => {
    renderForm();
    expect(screen.getByText("Hint for 1000")).toBeTruthy();
    const fill = screen.getByRole("button", { name: "Fill" });
    expect(fill.title).toBe("Enter a term first");
    expect((fill as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Term/), "30");
    await userEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect((screen.getByLabelText(/Principal/) as HTMLInputElement).value).toBe(
      "9000",
    );
    expect(screen.getByText("Hint for 9000")).toBeTruthy();
  });
});
