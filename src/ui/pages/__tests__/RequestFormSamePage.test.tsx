// @vitest-environment jsdom
//
// A form a navigation's request opened (⌘N's Add form, a Data check link's property
// form) stays open, with its edits, through a move to the page already shown: that move
// never asks, so it must not close the form either (ADR 0269 §4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Properties } from "../Properties";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

const ui = () => useUiStore.getState();
const owner = portfolio.properties[0]!;

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
    useUiStore.setState({
      route: "dashboard",
      selectedPropertyId: null,
      unsavedSources: [],
      pendingLeave: null,
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("a request-opened form through a same-page move", () => {
  it("⌘N's Add form, edited, stays open through navigate('properties')", async () => {
    act(() => ui().requestNewProperty());
    render(<Properties />);
    await userEvent.type(screen.getByLabelText(en.propertyForm.name), "Byt");
    act(() => ui().navigate("properties"));
    expect(ui().pendingLeave).toBeNull();
    expect(
      screen.getByRole("dialog", { name: en.propertyForm.addTitle }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText(en.propertyForm.name) as HTMLInputElement).value,
    ).toBe("Byt");
  });

  it("a Data check link's edit form, edited, stays open through openProperty(sameId)", async () => {
    act(() => ui().openProperty(owner.id, "edit"));
    render(<PropertyDetail />);
    const name = screen.getByLabelText(
      en.propertyForm.name,
    ) as HTMLInputElement;
    await userEvent.type(name, " X");
    const typed = name.value;
    act(() => ui().openProperty(owner.id));
    expect(ui().pendingLeave).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      (screen.getByLabelText(en.propertyForm.name) as HTMLInputElement).value,
    ).toBe(typed);
  });
});
