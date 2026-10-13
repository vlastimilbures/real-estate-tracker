// @vitest-environment jsdom
//
// Projections names its money terms in the subtitle; in Real mode that includes the base
// date the amounts are deflated to (ADR 0111, #21).
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

describe("a property whose id is portfolio (#210, ADR 0191 §1)", () => {
  // Before ADR 0127 a property named "Portfolio" got the id `portfolio`.
  const id = portfolio.properties[0].id;
  const own = (pid: string) => (pid === id ? "portfolio" : pid);
  const clash = {
    properties: portfolio.properties.map((p) =>
      p.id === id ? { ...p, id: "portfolio", name: "Portfolio" } : p,
    ),
    mortgages: portfolio.mortgages.map((m) => ({
      ...m,
      propertyId: own(m.propertyId),
    })),
    valuations: portfolio.valuations.map((v) => ({
      ...v,
      propertyId: own(v.propertyId),
    })),
    leases: portfolio.leases.map((l) => ({
      ...l,
      propertyId: own(l.propertyId),
    })),
    holdingCosts: portfolio.holdingCosts.map((c) => ({
      ...c,
      propertyId: own(c.propertyId),
    })),
  };

  it("is its own choice, apart from the whole portfolio", () => {
    act(() => usePortfolioStore.setState({ portfolio: clash }));
    const { container } = render(<Projections />);
    const group = screen.getByRole("group", { name: en.projections.entity });
    const [whole, flat] = within(group).getAllByRole("button", {
      name: "Portfolio",
    });
    const pressed = () =>
      [whole, flat].map((b) => b.getAttribute("aria-pressed"));
    expect(pressed()).toEqual(["true", "false"]);
    const portfolioTable = container.querySelector("table")!.textContent;

    fireEvent.click(flat);
    expect(pressed()).toEqual(["false", "true"]);
    expect(container.querySelector("table")!.textContent).not.toBe(
      portfolioTable,
    );
  });
});
