// @vitest-environment jsdom
//
// DateInput loads the calendar on the first open (DR-009). This test has its own file, so
// DateInput's module-level calendar cache is always empty here, whatever the test order.
import { describe, it, expect, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateInput } from "../DateInput";

// Load the calendar module up front; DateInput's own cache stays empty. Under coverage
// the first transform can outlast findBy's 1 s wait.
beforeAll(async () => {
  await import("../DateCalendar");
});

describe("DateInput calendar loading", () => {
  it("opens the calendar only once its code has loaded", async () => {
    render(<DateInput value="" onChange={() => {}} />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await screen.findByRole("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
