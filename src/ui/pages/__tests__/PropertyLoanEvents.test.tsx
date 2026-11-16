// @vitest-environment jsdom
//
// ADR 0116 §9–§10: Property detail shows the loan's modelled payoff, the interest its
// prepayments save, and a warning for an event the engine clamped. ADR 0117: the outlook
// also lists each block's reset and the loan's remaining term.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { isoDate, money, portfolioOutputs, rate } from "../../../engine";
import { fmtCzk, fmtDate } from "../../../lib/format";
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
    const { portfolio: p } = usePortfolioStore.getState();
    const loan = portfolioOutputs(
      p!,
      assumptions,
      assumptions.baseDate,
    ).financing.loans.find((l) => l.propertyId === "javorova")!;
    const text = outlook().textContent;
    expect(text).toContain(pd.interestSaved);
    expect(text).toContain(fmtCzk(loan.interestSaved!));
    expect(text).toContain(fmtDate(loan.payoffDate!));
    expect(loan.payoffDate!.getTime()).toBeLessThan(
      isoDate("2051-05-17").getTime(),
    );
    expect(document.querySelectorAll(".banner.warn")).toHaveLength(0);
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
    // Loan warnings are status, not alerts (ADR 0157).
    const warning = screen
      .getAllByRole("status")
      .find((a) => a.textContent?.includes("17.01.2031"));
    expect(warning?.textContent).toContain("is more than the balance");
  });
});

describe("ADR 0117: block resets in the loan outlook", () => {
  it("lists the block's reset and the remaining term at the as-of date", () => {
    act(() => useUiStore.setState({ asOf: assumptions.baseDate }));
    render(<PropertyDetail />);
    const reset = portfolioOutputs(
      portfolio,
      assumptions,
      assumptions.baseDate,
    ).financing.resets.find((r) => r.blockId === "m-javorova")!;
    const section = outlook();
    expect(section.textContent).toContain(pd.remainingTerm);
    expect(section.textContent).toContain("25 yrs");
    const table = within(section).getByRole("table", {
      name: pd.outlookResetsTitle,
    });
    const row = within(table).getByRole("row", { name: /17\.01\.2031/ });
    expect(row.textContent).toContain(fmtCzk(reset.balance));
    expect(row.textContent).toContain(pd.outlookStatus.nextReset);
    expect(row.className).toContain("is-milestone");
  });
});

describe("ADR 0130: interest saved on Property detail", () => {
  it("shows n/a when a recast applies only with the prepayment", () => {
    act(() =>
      usePortfolioStore.setState({
        portfolio: {
          ...portfolio,
          mortgages: portfolio.mortgages.map((m) =>
            m.propertyId === "javorova"
              ? {
                  ...m,
                  prepayments: [
                    {
                      date: isoDate("2031-01-17"),
                      amount: money(300000),
                      effect: "lowerInstalment" as const,
                    },
                  ],
                  recasts: [
                    { date: isoDate("2031-01-17"), instalment: money(5000) },
                  ],
                }
              : m,
          ),
        },
        assumptions,
        status: "ready",
      }),
    );
    render(<PropertyDetail />);
    const text = outlook().textContent;
    expect(text).toContain(pd.interestSaved);
    expect(text).toContain(pd.interestSavedNa);
    expect(text).not.toContain("433");
  });

  it("hides interest saved when a successor replaced the prepayment", () => {
    act(() =>
      usePortfolioStore.setState({
        portfolio: {
          ...portfolio,
          mortgages: [
            ...portfolio.mortgages.map((m) =>
              m.propertyId === "javorova"
                ? {
                    ...m,
                    prepayments: [
                      {
                        date: isoDate("2037-01-17"),
                        amount: money(100000),
                        effect: "lowerInstalment" as const,
                      },
                    ],
                  }
                : m,
            ),
            {
              id: "m-refi",
              propertyId: "javorova",
              startDate: isoDate("2036-01-17"),
              initialPrincipal: money(900000),
              fixationYears: 5,
              interestRatePa: rate("0.039"),
              monthlyInstalment: money(9800),
            },
          ],
        },
        assumptions,
        status: "ready",
      }),
    );
    render(<PropertyDetail />);
    expect(outlook().textContent).not.toContain(pd.interestSaved);
  });
});

describe("ADR 0130: a prepayment at the refix saves nothing in the model", () => {
  it("hides interest saved: the successor's typed principal already holds it", () => {
    const refix = isoDate("2031-01-17");
    const mortgages = [
      ...portfolio.mortgages.map((m) =>
        m.propertyId === "javorova"
          ? {
              ...m,
              prepayments: [
                {
                  date: refix,
                  amount: money(200000),
                  effect: "lowerInstalment" as const,
                },
              ],
            }
          : m,
      ),
      {
        id: "m-refi",
        propertyId: "javorova",
        startDate: refix,
        initialPrincipal: money(1186000),
        fixationYears: 5,
        interestRatePa: rate("0.039"),
        monthlyInstalment: money(9800),
      },
    ];
    const p = { ...portfolio, mortgages };
    const loan = portfolioOutputs(
      p,
      assumptions,
      assumptions.baseDate,
    ).financing.loans.find((l) => l.propertyId === "javorova")!;
    expect(loan.interestSaved?.isZero()).toBe(true);
    act(() =>
      usePortfolioStore.setState({
        portfolio: p,
        assumptions,
        status: "ready",
      }),
    );
    render(<PropertyDetail />);
    expect(outlook().textContent).not.toContain(pd.interestSaved);
  });
});

describe("ADR 0224: the Loan outlook after the charts, as a figure row", () => {
  const figures = () =>
    [...outlook().querySelectorAll(".fx-figure")].map((f) => [
      f.querySelector("dt")?.textContent,
      f.querySelector(".fx-value")?.textContent,
    ]);

  it("sits in the Overview, right after the charts, not under Financing", () => {
    render(<PropertyDetail />);
    const panel = outlook();
    expect(panel.closest(".pd-section")?.id).toBe("pd-overview");
    const charts = document.querySelector("#pd-overview .chart-grid")!;
    expect(
      charts.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector("#pd-financing")?.contains(panel)).toBe(
      false,
    );
  });

  it("opens with the figures: next reset, debt at reset, payoff, remaining term", () => {
    act(() => useUiStore.setState({ asOf: assumptions.baseDate }));
    render(<PropertyDetail />);
    const reset = portfolioOutputs(
      portfolio,
      assumptions,
      assumptions.baseDate,
    ).financing.resets.find((r) => r.blockId === "m-javorova")!;
    expect(figures()).toEqual([
      [pd.outlookStatus.nextReset, "17.01.2031"],
      [pd.colBalanceAtReset, fmtCzk(reset.balance)],
      [pd.loanPayoff, "17.05.2051"],
      [pd.remainingTerm, "25 yrs"],
    ]);
    // The resets table stays below.
    expect(
      within(outlook()).getByRole("table", { name: pd.outlookResetsTitle }),
    ).toBeTruthy();
  });

  it("adds interest saved as a figure when a prepayment saves some", () => {
    withPrepayments([
      {
        date: isoDate("2031-01-17"),
        amount: money(500000),
        effect: "shortenTerm",
      },
    ]);
    render(<PropertyDetail />);
    expect(figures().map(([k]) => k)).toContain(pd.interestSaved);
  });

  it("the note is behind the info icon, not under the panel", () => {
    render(<PropertyDetail />);
    const info = within(outlook()).getByRole("button", {
      name: `${en.common.aboutThis}: ${pd.loanSummaryTitle}`,
    });
    expect(
      document.getElementById(info.getAttribute("aria-controls")!)?.textContent,
    ).toBe(pd.loanSummaryNote);
    expect(outlook().querySelector(".panel-note")).toBeNull();
  });
});
