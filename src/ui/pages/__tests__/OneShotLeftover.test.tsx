// @vitest-environment jsdom
//
// ADR 0269: a one-shot request (⌘N's Add form, a Guide term, a Property detail target)
// travels with its navigation and ends with that visit. A request its page never handled
// — the page did not mount, or failed first — is dropped when the user leaves, so a later
// visit starts without it. A repeated ⌘N still re-opens Add.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Properties } from "../Properties";
import { Guide } from "../Guide";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

const ui = () => useUiStore.getState();
const addDialog = () =>
  screen.queryByRole("dialog", { name: en.propertyForm.addTitle });

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
    });
    useUiStore.setState({ route: "dashboard", selectedPropertyId: null });
    ui().navigate("dashboard");
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("a one-shot request its page never handled (ADR 0269)", () => {
  it("⌘N's request is dropped on leaving: the next visit to Properties opens nothing", () => {
    act(() => ui().requestNewProperty());
    // Properties never handled it (it did not mount); the user goes elsewhere.
    act(() => ui().navigate("dashboard"));
    act(() => ui().navigate("properties"));
    render(<Properties />);
    expect(addDialog()).toBeNull();
  });

  it("a Guide term is dropped on leaving: the next visit to the Guide moves no focus", () => {
    act(() => ui().openGuide("noi"));
    act(() => ui().navigate("dashboard"));
    act(() => ui().navigate("guide"));
    const before = document.activeElement;
    render(<Guide />);
    expect(document.activeElement).toBe(before);
  });

  it("a property target is dropped on leaving: going back to the property lands nowhere", () => {
    const owner = portfolio.properties[0]!;
    act(() => {
      usePortfolioStore.setState({
        portfolio: null,
        status: { kind: "loading" },
      });
      ui().openProperty(owner.id, "financing");
    });
    act(() => ui().navigate("dashboard"));
    act(() => {
      ui().navigate("property");
      usePortfolioStore.setState({ portfolio, status: { kind: "ready" } });
    });
    const before = document.activeElement;
    render(<PropertyDetail />);
    expect(document.activeElement).toBe(before);
  });
});

describe("a one-shot request on its own visit (kept)", () => {
  it("a Guide term with no glossary entry moves no focus", () => {
    act(() => ui().openGuide("no-such-term"));
    const before = document.activeElement;
    render(<Guide />);
    expect(document.activeElement).toBe(before);
  });

  it("a repeated ⌘N on Properties re-opens Add after it was closed", async () => {
    act(() => ui().requestNewProperty());
    render(<Properties />);
    expect(addDialog()).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(addDialog()).toBeNull();
    act(() => ui().requestNewProperty());
    expect(addDialog()).toBeTruthy();
  });
});
