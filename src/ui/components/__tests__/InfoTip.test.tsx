// @vitest-environment jsdom
//
// ADR 0217 (#416): a definition sits behind an info icon beside the panel title; an
// instruction stays a visible help line.
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Panel } from "../primitives";
import { InfoTip } from "../InfoTip";
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
});
