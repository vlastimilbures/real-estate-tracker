// @vitest-environment jsdom
//
// UX-056 (DR-146): when stored data breaks an engine rule, Property detail still shows
// the property's records — so the bad one can be fixed here — with the UX-049 message,
// instead of falling back to the app-wide error screen.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { money } from "../../../engine";

vi.mock("../../../data/errorLog", () => ({ logFailure: vi.fn() }));

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
      status: "ready",
    });
    useUiStore.setState({
      language: "en",
      route: "property",
      selectedPropertyId: owner.id,
      asOf: null,
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
