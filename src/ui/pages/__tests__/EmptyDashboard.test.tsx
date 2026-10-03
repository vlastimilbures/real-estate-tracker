// @vitest-environment jsdom
//
// UX-035: the empty portfolio screen speaks plainly, offers Import next to Add property
// and hides the Nominal/Real toggle (nothing to switch).
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../Dashboard";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

beforeEach(() =>
  act(() => {
    useUiStore.setState({ language: "en", route: "dashboard" });
    usePortfolioStore.setState({
      status: "ready",
      assumptions,
      portfolio: {
        properties: [],
        mortgages: [],
        valuations: [],
        leases: [],
        holdingCosts: [],
      },
    });
  }),
);

describe("empty Dashboard (UX-035)", () => {
  it("says how to begin without jargon and hides the lens toggle", () => {
    render(<Dashboard />);
    expect(screen.getByText(en.common.noPortfolioBody)).toBeTruthy();
    expect(en.common.noPortfolioBody).not.toMatch(/seed/i);
    expect(
      screen.queryByRole("group", { name: en.shell.nominalOrReal }),
    ).toBeNull();
  });

  it("offers Import next to Add property", async () => {
    render(<Dashboard />);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.importCsv }),
    );
    expect(useUiStore.getState().route).toBe("import");
  });
});
