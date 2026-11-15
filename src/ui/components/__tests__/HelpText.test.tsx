// @vitest-environment jsdom
//
// ADR 0214 (#391): an explanation sits in the panel body as a help line, or behind an
// "About this" disclosure; the header keeps context only.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Panel } from "../primitives";
import { HelpText } from "../HelpText";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Panel help (ADR 0214 §2)", () => {
  it("a help line leads the body, not the header", () => {
    const { container } = render(
      <Panel title="Leases" hint="nominal Kč" help={<HelpText>Why.</HelpText>}>
        <p>body</p>
      </Panel>,
    );
    const head = container.querySelector(".panel-head")!;
    expect(head.textContent).toBe("Leasesnominal Kč");
    const body = container.querySelector(".panel-body")!;
    expect(body.firstElementChild?.className).toBe("panel-help");
    expect(body.firstElementChild?.textContent).toBe("Why.");
  });

  it("a longer explanation is one click away, by keyboard too", async () => {
    render(
      <Panel
        title="Valuations"
        help={<HelpText about="Valuations">Long why.</HelpText>}
      >
        <p>body</p>
      </Panel>,
    );
    const toggle = screen.getByRole("button", {
      name: `${en.common.aboutThis}: Valuations`,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Long why.").closest("[hidden]")).not.toBeNull();
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Long why.").closest("[hidden]")).toBeNull();
  });

  it("two on a page have different names: the topic follows, for screen readers", () => {
    render(
      <>
        <HelpText about="Valuations">A.</HelpText>
        <HelpText about="Tranche loan">B.</HelpText>
      </>,
    );
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual([
      `${en.common.aboutThis}: Valuations`,
      `${en.common.aboutThis}: Tranche loan`,
    ]);
    // The topic is screen-reader text; the visible label stays "About this".
    expect(
      screen.getAllByRole("button")[0]!.querySelector(".sr-only")?.textContent,
    ).toBe(": Valuations");
  });
});
