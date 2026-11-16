// @vitest-environment jsdom
//
// ADR 0217 (#416): a definition sits behind an info icon beside the panel title; an
// instruction stays a visible help line.
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Panel } from "../primitives";
import { InfoTip } from "../InfoTip";
import { placeTip } from "../../model/infoTip";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

const nameOf = (topic: string) => `${en.common.aboutThis}: ${topic}`;
const popoverOf = (button: HTMLElement) =>
  document.getElementById(button.getAttribute("aria-controls")!)!;

describe("InfoTip (ADR 0217 §2)", () => {
  it("sits in the panel head after the title; the body starts with its content", () => {
    const { container } = render(
      <Panel title="Leases" hint="nominal Kč" info="What a lease is.">
        <p>body</p>
      </Panel>,
    );
    const head = container.querySelector(".panel-head")!;
    const button = screen.getByRole("button", { name: nameOf("Leases") });
    expect(head.contains(button)).toBe(true);
    expect(
      container.querySelector(".panel-body")!.firstElementChild?.tagName,
    ).toBe("P");
    expect(container.querySelector(".panel-help")).toBeNull();
  });

  it("is shut at rest, with the text in the DOM and named by aria-controls", () => {
    render(<InfoTip topic="Valuations">Long why.</InfoTip>);
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const pop = popoverOf(button);
    expect(pop.textContent).toBe("Long why.");
    expect(pop.hidden).toBe(true);
  });

  it("opens on keyboard focus and Escape closes it without moving focus", async () => {
    render(<InfoTip topic="Valuations">Long why.</InfoTip>);
    await userEvent.tab();
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(popoverOf(button).hidden).toBe(false);
    await userEvent.keyboard("{Escape}");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("Escape on an open tip stops there: a dialog's own Escape does not fire", async () => {
    let outer = 0;
    render(
      <div onKeyDown={(e) => e.key === "Escape" && (outer += 1)}>
        <InfoTip topic="Valuations">Long why.</InfoTip>
      </div>,
    );
    await userEvent.tab();
    await userEvent.keyboard("{Escape}");
    expect(outer).toBe(0);
    // Shut, the next Escape reaches the dialog as before.
    await userEvent.keyboard("{Escape}");
    expect(outer).toBe(1);
  });

  it("opens on hover and stays while the pointer is over the popover", () => {
    render(<InfoTip topic="Valuations">Long why.</InfoTip>);
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    const wrap = button.parentElement!;
    fireEvent.mouseEnter(wrap);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    // The popover lives inside the same wrapper, so moving onto it is no leave.
    expect(wrap.contains(popoverOf(button))).toBe(true);
    fireEvent.mouseLeave(wrap);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("a click pins it open past the pointer leaving; an outside click closes it", async () => {
    render(
      <>
        <InfoTip topic="Valuations">Long why.</InfoTip>
        <button type="button">elsewhere</button>
      </>,
    );
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    const wrap = button.parentElement!;
    fireEvent.mouseEnter(wrap);
    await userEvent.click(button);
    fireEvent.mouseLeave(wrap);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("a second click on a pinned tip closes it", async () => {
    render(<InfoTip topic="Valuations">Long why.</InfoTip>);
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    await userEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("the open popover is never a tab stop: Tab from the icon goes on to the next control", async () => {
    render(
      <>
        <InfoTip topic="Valuations">Long why.</InfoTip>
        <button type="button">Next</button>
      </>,
    );
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    await userEvent.tab();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    // Chromium makes an overflowing popover a tab stop unless it opts out; it hides
    // as the icon loses focus, which would drop focus to the page.
    expect(popoverOf(button).getAttribute("tabindex")).toBe("-1");
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe("Next");
  });

  it("two on a page have different names", () => {
    render(
      <>
        <InfoTip topic="Valuations">A.</InfoTip>
        <InfoTip topic="Tranche loan">B.</InfoTip>
      </>,
    );
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual([nameOf("Valuations"), nameOf("Tranche loan")]);
  });

  it("the text is the button's description, also while it is hidden", () => {
    render(<InfoTip topic="Valuations">Long why.</InfoTip>);
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    expect(button.getAttribute("aria-describedby")).toBe(
      button.getAttribute("aria-controls"),
    );
  });

  it("closed by an outside click while pinned, it opens again on the next hover (no focus, as WebKit)", () => {
    render(
      <>
        <InfoTip topic="Valuations">Long why.</InfoTip>
        <button type="button">elsewhere</button>
      </>,
    );
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    const wrap = button.parentElement!;
    fireEvent.mouseEnter(wrap);
    fireEvent.click(button);
    fireEvent.mouseLeave(wrap);
    fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.mouseEnter(wrap);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("a pin ends when focus leaves; Escape then reaches the form, and focus back reopens it", async () => {
    let outer = 0;
    render(
      <div onKeyDown={(e) => e.key === "Escape" && (outer += 1)}>
        <InfoTip topic="Valuations">Long why.</InfoTip>
        <input aria-label="field" />
      </div>,
    );
    const button = screen.getByRole("button", { name: nameOf("Valuations") });
    await userEvent.tab();
    await userEvent.keyboard("{Enter}"); // focus showed it: Enter closes
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await userEvent.keyboard("{Enter}"); // and pins it again
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await userEvent.tab();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await userEvent.keyboard("{Escape}");
    expect(outer).toBe(1);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("placeTip (ADR 0217 §2)", () => {
  const win = { width: 900, height: 600 };
  const pop = { width: 300, height: 100 };

  it("goes under the button, its left edge at the button's", () => {
    expect(
      placeTip({ top: 100, bottom: 124, left: 400 }, pop, win, 60),
    ).toEqual({
      left: 400,
      top: 130,
      visible: true,
    });
  });

  it("shifts left to stay inside the window's right edge", () => {
    expect(placeTip({ top: 100, bottom: 124, left: 800 }, pop, win).left).toBe(
      900 - 16 - 300,
    );
  });

  it("flips above when the room below is short and above is larger", () => {
    expect(
      placeTip({ top: 520, bottom: 544, left: 400 }, pop, win, 60).top,
    ).toBe(520 - 6 - 100);
  });

  it("never above the top bar: a tall text starts under it", () => {
    const tall = { width: 300, height: 500 };
    expect(
      placeTip({ top: 400, bottom: 424, left: 400 }, tall, win, 120).top,
    ).toBe(120);
  });

  it("is not visible while the button is under the top bar or below the window", () => {
    expect(
      placeTip({ top: 40, bottom: 64, left: 400 }, pop, win, 120).visible,
    ).toBe(false);
    expect(
      placeTip({ top: 620, bottom: 644, left: 400 }, pop, win, 120).visible,
    ).toBe(false);
  });
});
