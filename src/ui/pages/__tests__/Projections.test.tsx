// @vitest-environment jsdom
//
// Projections names its money terms in the subtitle; in Real mode that includes the base
// date the amounts are deflated to (ADR 0111, #21).
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Projections } from "../Projections";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const period = "flows per year, balances at year end";

beforeEach(() =>
  act(() => {
    usePortfolioStore.setState({ portfolio, assumptions, status: "ready" });
    useUiStore.setState({
      language: "en",
      route: "projections",
      mode: "nominal",
    });
  }),
);

describe("Projections context line", () => {
  it("says nominal Kč and the period in Nominal mode", () => {
    render(<Projections />);
    expect(
      screen.getByText(`Year-by-year · nominal Kč · ${period}`),
    ).toBeTruthy();
  });

  it("names the base date in Real mode", () => {
    act(() => useUiStore.setState({ mode: "real" }));
    render(<Projections />);
    expect(
      screen.getByText(
        `Year-by-year · real terms (Kč at projection start 07.06.2026) · ${period}`,
      ),
    ).toBeTruthy();
  });

  it("shows the export action as text", () => {
    render(<Projections />);
    const button = screen.getByRole("button", {
      name: en.xlsx.exportToExcel,
    });
    expect(button.textContent).toBe(en.xlsx.exportToExcel);
  });
});
