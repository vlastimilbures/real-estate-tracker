// @vitest-environment jsdom
//
// UX-056 (DR-146): when stored data breaks an engine rule, Property detail still shows
// the property's records — so the bad one can be fixed here — with the UX-049 message,
// instead of falling back to the app-wide error screen.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { isoDate, money, mortgageBlock } from "../../../engine";

const loan = portfolio.mortgages[0];
const owner = portfolio.properties.find((p) => p.id === loan.propertyId)!;
// An instalment below the monthly interest breaks D-17: the engine refuses the inputs.
const broken = {
  ...portfolio,
  mortgages: portfolio.mortgages.map((m) =>
    m.id === loan.id ? { ...m, monthlyInstalment: money(1) } : m,
  ),
};

beforeEach(() =>
  act(() => {
    usePortfolioStore.setState({
      portfolio: broken,
      assumptions,
      status: { kind: "ready" },
    });
    useUiStore.setState({
      route: "property",
      selectedPropertyId: owner.id,
    });
  }),
);

describe("Property detail with invalid stored data (UX-056)", () => {
  it("names the rule and keeps the records editable", () => {
    render(<PropertyDetail />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(en.errorBoundary.invalidDataTitle);
    expect(alert.textContent).toContain(
      en.inputRules.INSTALMENT_BELOW_INTEREST,
    );
    expect(screen.getByText(en.propertyDetail.mortgagesTitle)).toBeTruthy();
    expect(screen.getByText(en.propertyDetail.valuationsTitle)).toBeTruthy();
    // No figures from the engine.
    expect(
      screen.queryByText(en.propertyDetail.projectionTitle(30)),
    ).toBeNull();
  });
});

describe("Property detail with a loan shape ADR 0226 refuses", () => {
  // Javorova's loan from 2021-01-17 over 30 years: payment 358 is due 2050-11-17.
  const lateDraw = {
    ...portfolio,
    mortgages: portfolio.mortgages.map((m) =>
      m.id === loan.id
        ? mortgageBlock({
            ...m,
            loanTermYears: 30,
            draws: [{ date: isoDate("2050-12-01"), amount: money(100000) }],
          })
        : m,
    ),
  };
  const quickRefinance = {
    ...portfolio,
    mortgages: [
      ...portfolio.mortgages,
      { ...loan, id: "m-next", startDate: isoDate("2021-02-10") },
    ],
  };
  it.each([
    [
      "a draw in the last two payment months",
      lateDraw,
      "DRAW_IN_LAST_TWO_PAYMENTS",
    ],
    ["a refinance within a month", quickRefinance, "REFINANCE_WITHIN_A_MONTH"],
  ] as const)("%s: shows the rule and no figures", (_, stored, code) => {
    act(() => {
      usePortfolioStore.setState({ portfolio: stored });
    });
    render(<PropertyDetail />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(en.errorBoundary.invalidDataTitle);
    expect(alert.textContent).toContain(en.inputRules[code]);
    expect(screen.getByText(en.propertyDetail.mortgagesTitle)).toBeTruthy();
    expect(
      screen.queryByText(en.propertyDetail.projectionTitle(30)),
    ).toBeNull();
  });
});

// ADR 0265: with no figures, the Nominal/Real switch would change nothing on this page,
// so it is hidden, as on every other page with nothing to switch. The lens is kept.
describe("the Nominal/Real switch on Property detail (ADR 0265)", () => {
  const lens = () =>
    screen.queryByRole("group", { name: en.shell.nominalOrReal });

  it("is hidden while the property's data is invalid", () => {
    render(<PropertyDetail />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(lens()).toBeNull();
  });

  it("is shown with valid data", () => {
    act(() => {
      usePortfolioStore.setState({ portfolio });
    });
    render(<PropertyDetail />);
    expect(lens()).not.toBeNull();
  });

  it("comes back with the same lens once the data is valid again", () => {
    act(() => {
      useUiStore.setState({ mode: "real" });
    });
    render(<PropertyDetail />);
    expect(lens()).toBeNull();
    expect(useUiStore.getState().mode).toBe("real");
    act(() => {
      usePortfolioStore.setState({ portfolio });
    });
    const group = lens();
    expect(group).not.toBeNull();
    const real = within(group!).getByRole("button", { name: en.common.real });
    expect(real.getAttribute("aria-pressed")).toBe("true");
    expect(useUiStore.getState().mode).toBe("real");
  });
});
