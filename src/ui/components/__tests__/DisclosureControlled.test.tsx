// @vitest-environment jsdom
//
// #490 PR 3: Disclosure's open state can be its caller's (`open` / `onOpenChange`), as
// the property dialog's Acquisition section keeps it (ADR 0119 §9); without `open` it
// keeps its own, from `defaultOpen` (ADR 0203).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Disclosure } from "../Disclosure";

const button = () => screen.getByRole("button", { name: "More" });
const region = () =>
  document.getElementById(button().getAttribute("aria-controls")!)!;

describe("Disclosure open state (#490)", () => {
  it("keeps its own from defaultOpen when uncontrolled", async () => {
    render(
      <Disclosure label="More" defaultOpen>
        body
      </Disclosure>,
    );
    expect(button().getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(button());
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(region().hidden).toBe(true);
  });

  it("shows the caller's state and asks it to change", async () => {
    const onOpenChange = vi.fn();
    render(
      <Disclosure label="More" open={false} onOpenChange={onOpenChange}>
        body
      </Disclosure>,
    );
    await userEvent.click(button());
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // The caller did not change it, so it stays shut.
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(region().hidden).toBe(true);
  });

  it("follows the caller's state when it changes", async () => {
    function Owner() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open it
          </button>
          <Disclosure label="More" open={open} onOpenChange={setOpen}>
            body
          </Disclosure>
        </>
      );
    }
    render(<Owner />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(region().hidden).toBe(false);
    await userEvent.click(button());
    expect(button().getAttribute("aria-expanded")).toBe("false");
  });
});
