// @vitest-environment jsdom
//
// ADR 0248 §5–§6 (#549): the core hook moves focus only once a busy action ends, only
// from <body> or the control that started it, and only to an element that is on the page
// and enabled. `pageTitle` makes the PageFrame h1 focusable from script for that one focus.
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  KEEP,
  pageTitle,
  pressed,
  useBusyFocus,
  type BusyFocusTarget,
} from "../useBusyFocus";

/** A busy flag driven by two buttons; `target` decides where focus goes. */
function Harness({ target }: { target: BusyFocusTarget }) {
  const [busy, setBusy] = useBusyFocus(target);
  return (
    <section className="panel">
      <button type="button" onClick={() => setBusy(true)}>
        Start
      </button>
      <button type="button" onClick={() => setBusy(false)}>
        End
      </button>
      <button type="button" disabled>
        Off
      </button>
      <span>{busy ? "busy" : "idle"}</span>
    </section>
  );
}

const button = (name: string) => screen.getByRole("button", { name });

/** Start from the focused Start button, drop focus to <body>, then end. */
function startDropEnd() {
  act(() => button("Start").focus());
  act(() => button("Start").click());
  act(() => button("Start").blur());
  act(() => button("End").click());
}

describe("useBusyFocus (ADR 0248 §5–§6)", () => {
  it("asks the target with the trigger and its panel, and focuses what it names", () => {
    const target = vi.fn<BusyFocusTarget>(pressed);
    render(<Harness target={target} />);
    act(() => button("Start").focus());
    act(() => button("Start").click());
    expect(target).not.toHaveBeenCalled();
    act(() => button("Start").blur());
    // A click on End focuses it, so end the action from script with focus on <body>.
    act(() => button("End").click());
    expect(target).toHaveBeenCalledWith(
      button("Start"),
      button("Start").closest("section"),
    );
    expect(document.activeElement).toBe(button("Start"));
  });

  it("does nothing when focus was on <body> as the action started", () => {
    const target = vi.fn<BusyFocusTarget>(pressed);
    render(<Harness target={target} />);
    act(() => button("Start").click());
    act(() => button("End").click());
    expect(target).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it("does nothing when busy ends without having started", () => {
    const target = vi.fn<BusyFocusTarget>(pressed);
    render(<Harness target={target} />);
    act(() => button("End").click());
    expect(target).not.toHaveBeenCalled();
  });

  it("leaves focus the user moved elsewhere", () => {
    const target = vi.fn<BusyFocusTarget>(pressed);
    render(<Harness target={target} />);
    act(() => button("Start").focus());
    act(() => button("Start").click());
    act(() => button("End").focus());
    act(() => button("End").click());
    expect(target).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button("End"));
  });

  it("does not focus a disabled target", () => {
    render(<Harness target={() => button("Off")} />);
    startDropEnd();
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses nothing when the target has left the page and there is no page title", () => {
    const gone = document.createElement("button");
    render(<Harness target={() => gone} />);
    startDropEnd();
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses nothing when the target is gone and there is no page title", () => {
    render(<Harness target={() => null} />);
    startDropEnd();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("useBusyFocus: the last resort (ADR 0248 §3)", () => {
  /** The harness under the PageFrame's page title. */
  function renderTitled(target: BusyFocusTarget) {
    render(
      <>
        <header className="topbar">
          <h1 className="page-title">Settings</h1>
        </header>
        <Harness target={target} />
      </>,
    );
  }
  const title = () => screen.getByRole("heading", { name: "Settings" });

  it("focuses the page title when the target has left the page (#549 review)", () => {
    renderTitled(() => document.createElement("button"));
    startDropEnd();
    expect(document.activeElement).toBe(title());
  });

  it("focuses the page title when the target is gone (#549 review)", () => {
    renderTitled(() => null);
    startDropEnd();
    expect(document.activeElement).toBe(title());
  });

  it("leaves focus alone when the target says KEEP", () => {
    renderTitled(() => KEEP);
    startDropEnd();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("pageTitle (ADR 0248 §3)", () => {
  it("is null without a page title", () => {
    render(<p>No title</p>);
    expect(pageTitle()).toBeNull();
  });

  it("makes the h1 focusable from script until it loses focus", () => {
    render(
      <header className="topbar">
        <h1 className="page-title">Property</h1>
        <button type="button">Next</button>
      </header>,
    );
    const h1 = pageTitle()!;
    expect(h1.getAttribute("tabindex")).toBe("-1");
    act(() => h1.focus());
    expect(document.activeElement).toBe(h1);
    act(() => button("Next").focus());
    expect(h1.hasAttribute("tabindex")).toBe(false);
  });

  it("keeps a tabindex the h1 already has", () => {
    render(
      <header className="topbar">
        <h1 className="page-title" tabIndex={0}>
          Property
        </h1>
      </header>,
    );
    const h1 = pageTitle()!;
    act(() => h1.focus());
    act(() => h1.blur());
    expect(h1.getAttribute("tabindex")).toBe("0");
  });
});
