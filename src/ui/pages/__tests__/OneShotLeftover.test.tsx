// @vitest-environment jsdom
//
// The one-shot requests (⌘N's Add form, a Guide term, a Property detail target) are
// stored until the page that reads them clears them. A request whose page never cleared
// it — the page did not mount, or failed first — is still there on the next visit, and
// fires then. Characterisation for #468: today's behaviour, not a decision.
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Properties } from "../Properties";
import { Guide } from "../Guide";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

const ui = () => useUiStore.getState();

beforeEach(() => {
  act(() => {
    usePortfolioStore.setState({ portfolio, assumptions });
    useUiStore.setState({
      route: "dashboard",
      selectedPropertyId: null,
      guideTerm: null,
      newPropertyRequested: false,
      propertyTarget: null,
      unsavedSources: [],
      pendingLeave: null,
      pendingSource: null,
    });
  });
});

describe("a one-shot request its page never cleared", () => {
  it("⌘N's request is still there after leaving; the next visit to Properties opens Add", () => {
    act(() => ui().requestNewProperty());
    // Properties never cleared it (it did not mount); the user goes elsewhere.
    act(() => ui().navigate("dashboard"));
    expect(ui().newPropertyRequested).toBe(true);
    act(() => ui().navigate("properties"));
    render(<Properties />);
    expect(
      screen.getByRole("dialog", { name: en.propertyForm.addTitle }),
    ).toBeTruthy();
    expect(ui().newPropertyRequested).toBe(false);
  });

  it("a Guide term is still there after leaving; the next visit to the Guide focuses it", () => {
    act(() => ui().openGuide("noi"));
    act(() => ui().navigate("dashboard"));
    expect(ui().guideTerm).toBe("noi");
    act(() => ui().navigate("guide"));
    render(<Guide />);
    expect(document.activeElement).toBe(
      document.getElementById("glossary-noi"),
    );
    expect(ui().guideTerm).toBeNull();
  });

  it("a Guide term with no glossary entry is cleared without moving focus", () => {
    act(() => ui().openGuide("no-such-term"));
    const before = document.activeElement;
    render(<Guide />);
    expect(document.activeElement).toBe(before);
    expect(ui().guideTerm).toBeNull();
  });

  it("a property target is still there after leaving, until the next openProperty replaces it", () => {
    act(() => ui().openProperty("missing", "financing"));
    act(() => ui().navigate("dashboard"));
    expect(ui().propertyTarget).toBe("financing");
    act(() => ui().openProperty(portfolio.properties[0]!.id));
    expect(ui().propertyTarget).toBeNull();
  });
});
