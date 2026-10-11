// @vitest-environment jsdom
//
// useModalA11y reads `onClose` through a ref: Escape calls the latest handler, and the
// focus effect runs once on mount, not on every re-render with a fresh handler.
import { StrictMode, useState } from "react";
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

// Review of #279: StrictMode (dev, E2E, ux-capture) runs the effect twice. The first
// cleanup sees focus inside the dialog, not on <body>; focus must still go back to the
// element that opened it.
function Box({ onClose }: { onClose: () => void }) {
  const ref = useModalA11y(onClose, { restoreFocus: true });
  return (
    <div ref={ref} role="dialog" aria-label="Box">
      <button type="button">Inside</button>
    </div>
  );
}

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && <Box onClose={() => setOpen(false)} />}
    </>
  );
}

describe("useModalA11y focus restore", () => {
  it("returns focus to the opener under StrictMode", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Opener />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Inside" }),
    );
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open" }),
    );
  });
});

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

// #280 (ADR 0173, amends ADR 0157 decision 2): when the opener has left the page by the
// time the dialog closes (a dropdown option, its list closed on blur), focus goes to the
// first focusable element of the opener's nearest ancestor still on the page.
function Dropdown({ listOpen }: { listOpen: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div>
        <button type="button">Trigger</button>
        {listOpen && (
          <ul>
            <li>
              <button type="button" onClick={() => setOpen(true)}>
                Option
              </button>
            </li>
          </ul>
        )}
      </div>
      {open && <Box onClose={() => setOpen(false)} />}
    </>
  );
}

describe("useModalA11y focus fallback (#280)", () => {
  it("returns focus to the nearest connected element when the opener is gone", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Dropdown listOpen />);
    await user.click(screen.getByRole("button", { name: "Option" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Inside" }),
    );
    rerender(<Dropdown listOpen={false} />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Trigger" }),
    );
  });
});

// Review of PR #318: the fallback skips hidden or inert elements, and stops below the app
// root, so it never lands on the page's first focusable (the skip link).
function Page({ showGroup }: { showGroup: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">Skip to content</button>
      {showGroup && (
        <div>
          <div>
            <button type="button" onClick={() => setOpen(true)}>
              Option
            </button>
          </div>
        </div>
      )}
      {open && <Box onClose={() => setOpen(false)} />}
    </>
  );
}

/** Renders into a `#root` element, as the app does. */
function renderInRoot(ui: React.ReactElement) {
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  return render(ui, { container: root });
}

describe("useModalA11y focus fallback edges (#280)", () => {
  it("whole ancestor chain gone: no throw, and focus does not jump to the skip link", async () => {
    const user = userEvent.setup();
    const { rerender } = renderInRoot(<Page showGroup />);
    await user.click(screen.getByRole("button", { name: "Option" }));
    rerender(<Page showGroup={false} />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Skip to content" }),
    );
  });

  it("skips an inert or aria-hidden element and picks the next one", async () => {
    const user = userEvent.setup();
    function Removable({ list }: { list: boolean }) {
      const [open, setOpen] = useState(false);
      return (
        <>
          <div>
            {/* React 18 knows no `inert` prop: set the attribute as a string. */}
            <div {...{ inert: "" }}>
              <button type="button">Inert</button>
            </div>
            <button type="button" aria-hidden="true">
              Hidden
            </button>
            <button type="button">Trigger</button>
            {list && (
              <div>
                <button type="button" onClick={() => setOpen(true)}>
                  Option
                </button>
              </div>
            )}
          </div>
          {open && <Box onClose={() => setOpen(false)} />}
        </>
      );
    }
    const { rerender } = renderInRoot(<Removable list />);
    await user.click(screen.getByRole("button", { name: "Option" }));
    rerender(<Removable list={false} />);
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Trigger" }),
    );
  });
});
