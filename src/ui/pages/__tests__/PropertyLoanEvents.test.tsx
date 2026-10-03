// @vitest-environment jsdom
//
// ADR 0116 §9–§10: Property detail shows the loan's modelled payoff, the interest its
// prepayments save, and a warning for an event the engine clamped.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { isoDate, money } from "../../../engine";
import type { MortgagePrepayment } from "../../../engine";

vi.mock("../../../data/errorLog", () => ({ logFailure: vi.fn() }));
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

const pd = en.propertyDetail;

function withPrepayments(prepayments: MortgagePrepayment[]) {
  act(() =>
    usePortfolioStore.setState({
      portfolio: {
        ...portfolio,
        mortgages: portfolio.mortgages.map((m) =>
          m.propertyId === "javorova" ? { ...m, prepayments } : m,
        ),
      },
      assumptions,
      status: "ready",
    }),
  );
}

beforeEach(() => {
  act(() => {
    usePortfolioStore.setState({ portfolio, assumptions, status: "ready" });
    useUiStore.setState({
      language: "en",
      route: "property",
      selectedPropertyId: "javorova",
      asOf: null,
      amortizationOpen: false,
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    });
  });
});

const outlook = () =>
  screen
    .getByRole("heading", { name: pd.loanSummaryTitle })
    .closest("section")!;

describe("ADR 0116: loan outlook on Property detail", () => {
  it("shows the modelled payoff, and no interest saved without a prepayment", () => {
    render(<PropertyDetail />);
    expect(outlook().textContent).toContain(pd.loanPayoff);
    expect(outlook().textContent).toContain("17.05.2051");
    expect(outlook().textContent).not.toContain(pd.interestSaved);
  });

  it("shows interest saved and an earlier payoff with a prepayment", () => {
    withPrepayments([
      {
        date: isoDate("2031-01-17"),
        amount: money(500000),
        effect: "shortenTerm",
      },
    ]);
    render(<PropertyDetail />);
    expect(outlook().textContent).toContain(pd.interestSaved);
    expect(outlook().textContent).not.toContain("17.05.2051");
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("warns about a prepayment larger than the balance", () => {
    withPrepayments([
      {
        date: isoDate("2031-01-17"),
        amount: money(5000000),
        effect: "shortenTerm",
      },
    ]);
    render(<PropertyDetail />);
    const alert = screen
      .getAllByRole("alert")
      .find((a) => a.textContent?.includes("17.01.2031"));
    expect(alert?.textContent).toContain("is more than the balance");
  });
});
