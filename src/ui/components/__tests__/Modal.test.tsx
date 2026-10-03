// @vitest-environment jsdom
//
// UX-029: a modal keeps keyboard focus inside while open, returns it to the opener on
// close, and ignores Esc / backdrop clicks while it holds unsaved input.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../Modal";
import { DateInput } from "../DateInput";
import { ScenarioForm } from "../../pages/ScenarioForm";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { assumptions } from "../../../engine/__tests__/support/seed";

const en = getDict("en");

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

function Harness({ dirty = false }: { dirty?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      {open && (
        <Modal
          titleId="t"
          title="Dialog"
          closeLabel="Close"
          dirty={dirty}
          onClose={() => setOpen(false)}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          }
        >
          <input aria-label="First" />
        </Modal>
      )}
    </>
  );
}

const dialog = () => screen.queryByRole("dialog");

describe("modal focus (UX-029)", () => {
  it("Tab and Shift+Tab wrap inside the dialog", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    // Focus starts on the first control (the header ✕), then: input, Cancel.
    const close = screen.getByRole("button", { name: "Close" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(close);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(cancel);
  });

  it("returns focus to the opener on close", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("modal dirty guard (UX-029)", () => {
  it("an unchanged modal closes on Esc and on a backdrop click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.keyboard("{Escape}");
    expect(dialog()).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(document.querySelector(".modal-overlay")!);
    expect(dialog()).toBeNull();
  });

  it("a dirty modal ignores Esc and backdrop clicks; ✕ still closes", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.keyboard("{Escape}");
    expect(dialog()).not.toBeNull();
    await userEvent.click(document.querySelector(".modal-overlay")!);
    expect(dialog()).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog()).toBeNull();
  });

  it("the scenario form becomes dirty once a field changes", async () => {
    const onCancel = vi.fn();
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={() => undefined}
        onCancel={onCancel}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByLabelText(en.scenarios.name), "x");
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// DR-148: Esc in the date popover closes only the popover, not the (unchanged) modal
// around it.
describe("Esc inside a modal's date popover (DR-148)", () => {
  it("closes the popover and keeps the modal open", async () => {
    const onClose = vi.fn();
    render(
      <Modal titleId="t" title="Edit" onClose={onClose} closeLabel="Close">
        <DateInput value="07.06.2026" onChange={() => {}} />
      </Modal>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.calendar.open }),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    await userEvent.keyboard("{Escape}");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
