// @vitest-environment jsdom
//
// Exercises the parts static checks can't: the popover wiring and the dd.mm.yyyy ⇄ Date
// round-trip. The TZ assertion (clicking the 15th yields "15.06.2026") is the tripwire —
// it pins the local-Y/M/D conversion so a refactor can't reintroduce an off-by-one.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateInput } from "../DateInput";

// DateInput loads the calendar on the first open (DR-009). Load its module up front:
// under coverage the first transform can outlast findBy's 1 s wait.
beforeAll(async () => {
  await import("../DateCalendar");
});

describe("DateInput", () => {
  // First in the file: DateInput has not loaded the calendar yet in this module instance.
  it("opens the calendar only once its code has loaded (DR-009)", async () => {
    render(<DateInput value="" onChange={() => {}} />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await screen.findByRole("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("marks no day selected when the value is empty", async () => {
    const user = userEvent.setup();
    render(<DateInput value="" onChange={() => {}} />);
    await user.click(screen.getByRole("button")); // calendar trigger (only button pre-open)
    // Popover is portaled to <body>, so query the dialog rather than the render container.
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".rdp-selected")).toBeNull();
  });

  it("highlights the day matching the typed value", async () => {
    const user = userEvent.setup();
    render(<DateInput value="07.06.2026" onChange={() => {}} />);
    await user.click(screen.getByRole("button"));
    const dialog = await screen.findByRole("dialog");
    const selected = dialog.querySelector(".rdp-selected");
    expect(selected?.textContent).toBe("7");
  });

  it("calls onChange with dd.mm.yyyy when a day is picked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateInput value="07.06.2026" onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.click(within(await screen.findByRole("dialog")).getByText("15"));
    expect(onChange).toHaveBeenCalledWith("15.06.2026");
  });

  it("routes a calendar pick to onPick (not onChange) when provided", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onPick = vi.fn();
    render(
      <DateInput value="07.06.2026" onChange={onChange} onPick={onPick} />,
    );
    await user.click(screen.getByRole("button"));
    await user.click(within(await screen.findByRole("dialog")).getByText("15"));
    expect(onPick).toHaveBeenCalledWith("15.06.2026");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reopens after Escape and a pick still works", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateInput value="07.06.2026" onChange={onChange} />);
    const trigger = screen.getByRole("button");
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.visibility).toBe("visible");
    await user.click(within(dialog).getByText("15"));
    expect(onChange).toHaveBeenCalledWith("15.06.2026");
  });
});
