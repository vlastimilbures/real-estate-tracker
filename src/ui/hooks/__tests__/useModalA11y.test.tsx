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

// #128 R5-14 (ADR 0157): open dialogs form a stack. Escape and the Tab trap act on the
// top-most dialog only, so one Escape closes one dialog.
function Named({
  name,
  onClose,
  trap = false,
}: {
  name: string;
  onClose: () => void;
  trap?: boolean;
}) {
  const ref = useModalA11y(onClose, { trap });
  return (
    <div ref={ref} role="dialog" aria-label={name}>
      <button type="button">{`${name} first`}</button>
      <button type="button">{`${name} last`}</button>
    </div>
  );
}

function Stack({
  showTop,
  onBottom,
  onTop,
  trap = false,
}: {
  showTop: boolean;
  onBottom: () => void;
  onTop: () => void;
  trap?: boolean;
}) {
  return (
    <>
      <Named name="Bottom" onClose={onBottom} trap={trap} />
      {showTop && <Named name="Top" onClose={onTop} trap={trap} />}
    </>
  );
}

describe("useModalA11y dialog stack (#128 R5-14)", () => {
  it("one Escape closes only the top-most dialog", async () => {
    const user = userEvent.setup();
    const onBottom = vi.fn();
    const onTop = vi.fn();
    const { rerender } = render(
      <Stack showTop onBottom={onBottom} onTop={onTop} />,
    );
    await user.keyboard("{Escape}");
    expect(onTop).toHaveBeenCalledOnce();
    expect(onBottom).not.toHaveBeenCalled();
    rerender(<Stack showTop={false} onBottom={onBottom} onTop={onTop} />);
    await user.keyboard("{Escape}");
    expect(onBottom).toHaveBeenCalledOnce();
    expect(onTop).toHaveBeenCalledOnce();
  });

  it("only the top-most dialog wraps Tab", async () => {
    const user = userEvent.setup();
    render(<Stack showTop trap onBottom={() => {}} onTop={() => {}} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Top first" }),
    );
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Top first" }),
    );
  });
});
