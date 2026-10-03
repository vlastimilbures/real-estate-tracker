// @vitest-environment jsdom
//
// useModalA11y reads `onClose` through a ref: Escape calls the latest handler, and the
// focus effect runs once on mount, not on every re-render with a fresh handler.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useModalA11y } from "../useModalA11y";

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useModalA11y(onClose);
  return (
    <div ref={ref} role="dialog" aria-label="Dialog">
      <input aria-label="First" />
      <input aria-label="Second" />
    </div>
  );
}

describe("useModalA11y", () => {
  it("Escape calls the latest onClose after a re-render", async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Dialog onClose={first} />);
    rerender(<Dialog onClose={latest} />);
    await user.keyboard("{Escape}");
    expect(latest).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("moves focus in once on mount, not again on re-render", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Dialog onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByLabelText("First"));
    await user.click(screen.getByLabelText("Second"));
    rerender(<Dialog onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByLabelText("Second"));
  });
});
