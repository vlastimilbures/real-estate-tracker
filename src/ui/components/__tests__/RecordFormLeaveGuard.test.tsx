// @vitest-environment jsdom
//
// UX-073 (DR-151, ADR 0077): an inline record form whose draft differs from its opening
// values holds back navigation like Settings → Assumptions (UX-030). Each form registers
// on its own, so a clean form never clears another form's unsaved draft.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../forms";
import { LeaveGuard } from "../LeaveGuard";
import { useUiStore } from "../../../state/uiStore";
import type { WriteError } from "../../../state/writeError";

beforeEach(() =>
  act(() =>
    useUiStore.setState({
      language: "en",
      route: "property",
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    }),
  ),
);

function Form({
  label = "Price",
  onSubmit = () => undefined,
}: {
  label?: string;
  onSubmit?: () => WriteError | undefined;
}) {
  return (
    <RecordForm
      specs={[{ name: "price", label, kind: "money" }]}
      initial={{ price: "100" }}
      submitLabel={`Save ${label}`}
      onSubmit={onSubmit}
    />
  );
}

const unsaved = () => useUiStore.getState().unsavedChanges;

async function retype(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

describe("record form leave guard (UX-073)", () => {
  it("an untouched form leaves without asking", () => {
    render(<Form />);
    expect(unsaved()).toBe(false);
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(useUiStore.getState().route).toBe("dashboard");
  });

  it("an edited form asks; Keep editing keeps the draft", async () => {
    render(
      <>
        <Form />
        <LeaveGuard />
      </>,
    );
    await retype("Price", "250");
    expect(unsaved()).toBe(true);
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(useUiStore.getState().route).toBe("property");
    expect(
      screen.getByRole("dialog", { name: /unsaved changes/i }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /keep editing/i }),
    );
    expect(useUiStore.getState().route).toBe("property");
    expect((screen.getByLabelText("Price") as HTMLInputElement).value).toBe(
      "250",
    );
  });

  it("typing back the opening value clears the guard", async () => {
    render(<Form />);
    await retype("Price", "250");
    await retype("Price", "100");
    expect(unsaved()).toBe(false);
  });

  it("closing the form clears the guard", async () => {
    const { unmount } = render(<Form />);
    await retype("Price", "250");
    unmount();
    expect(unsaved()).toBe(false);
  });

  it("a saved draft no longer asks, even when the store normalises it", async () => {
    render(<Form />);
    await retype("Price", "1 000");
    await userEvent.click(screen.getByRole("button", { name: "Save Price" }));
    expect(unsaved()).toBe(false);
  });

  it("a refused save keeps asking", async () => {
    render(<Form onSubmit={() => ({ kind: "other", message: "disk full" })} />);
    await retype("Price", "250");
    await userEvent.click(screen.getByRole("button", { name: "Save Price" }));
    expect(unsaved()).toBe(true);
  });

  it("a clean form does not clear another form's draft", async () => {
    const { rerender } = render(
      <>
        <Form label="A" />
        <Form label="B" />
      </>,
    );
    await retype("A", "250");
    rerender(<Form label="A" />);
    expect(unsaved()).toBe(true);
  });
});
