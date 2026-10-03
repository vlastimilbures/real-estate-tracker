// @vitest-environment jsdom
//
// UX-066 (DR-143): File ▸ New Property… (⌘N) lands on Properties with a one-shot
// request; the page opens the Add form once and clears the request.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Properties } from "../Properties";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

beforeEach(() => {
  act(() => {
    usePortfolioStore.setState({ portfolio, assumptions });
    useUiStore.setState({
      language: "en",
      route: "properties",
      newPropertyRequested: false,
    });
  });
});

describe("Properties — New Property request (UX-066)", () => {
  it("opens the Add form once and clears the request", () => {
    act(() => useUiStore.setState({ newPropertyRequested: true }));
    render(<Properties />);
    expect(
      screen.getByRole("dialog", { name: en.propertyForm.addTitle }),
    ).toBeTruthy();
    expect(useUiStore.getState().newPropertyRequested).toBe(false);
  });

  it("without a request no form opens", () => {
    render(<Properties />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
