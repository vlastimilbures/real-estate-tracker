// @vitest-environment jsdom
//
// Projections names its money terms in the subtitle; in Real mode that includes the base
// date the amounts are deflated to (ADR 0111, #21).
import { describe, it, expect } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { Projections } from "../Projections";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { renderWithPortfolio } from "../../../__tests__/support/world";

const en = getDict("en");
// ADR 0211 §2: the sample's projection years run July to June, said once here.
const period =
  "flows per year, balances at year end · years run Jul – Jun, named by the year they end";

describe("Projections context line", () => {
  it("says nominal Kč and the period in Nominal mode", () => {
    renderWithPortfolio(<Projections />, { route: "projections" });
    expect(
      screen.getByText(`Year-by-year · nominal Kč · ${period}`),
    ).toBeTruthy();
  });

  it("names the base date in Real mode", () => {
    act(() => useUiStore.setState({ mode: "real" }));
    renderWithPortfolio(<Projections />, { route: "projections" });
    expect(
      screen.getByText(
        `Year-by-year · real terms (Kč at projection start 07.06.2026) · ${period}`,
      ),
    ).toBeTruthy();
  });

  it("shows the export action as text", () => {
    renderWithPortfolio(<Projections />, { route: "projections" });
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
    const { container } = renderWithPortfolio(<Projections />, {
      portfolio: clash,
      route: "projections",
    });
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
