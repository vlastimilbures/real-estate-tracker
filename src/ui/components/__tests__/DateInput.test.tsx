// @vitest-environment jsdom
//
// Exercises the parts static checks can't: the popover wiring and the dd.mm.yyyy ⇄ Date
// round-trip. The TZ assertion (clicking the 15th yields "15.06.2026") is the tripwire —
// it pins the local-Y/M/D conversion so a refactor can't reintroduce an off-by-one.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateInput } from "../DateInput";

describe("DateInput", () => {
  it("marks no day selected when the value is empty", async () => {
    const user = userEvent.setup();
    render(<DateInput value="" onChange={() => {}} />);
    await user.click(screen.getByRole("button")); // calendar trigger (only button pre-open)
    // Popover is portaled to <body>, so query the dialog rather than the render container.
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".rdp-selected")).toBeNull();
  });

  it("highlights the day matching the typed value", async () => {
    const user = userEvent.setup();
    render(<DateInput value="07.06.2026" onChange={() => {}} />);
    await user.click(screen.getByRole("button"));
    const selected = screen.getByRole("dialog").querySelector(".rdp-selected");
    expect(selected?.textContent).toBe("7");
  });

  it("calls onChange with dd.mm.yyyy when a day is picked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateInput value="07.06.2026" onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.click(within(screen.getByRole("dialog")).getByText("15"));
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
    await user.click(within(screen.getByRole("dialog")).getByText("15"));
    expect(onPick).toHaveBeenCalledWith("15.06.2026");
    expect(onChange).not.toHaveBeenCalled();
  });
});
