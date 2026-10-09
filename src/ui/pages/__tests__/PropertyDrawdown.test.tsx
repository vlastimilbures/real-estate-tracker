// @vitest-environment jsdom
//
// ADR 0167 §6: a development loan's Loan outlook shows how much is drawn, as a bar with
// its value as text, and each draw's status as text (never colour alone). The page's
// as-of date moves it.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { en } from "../../../i18n/en";
import { isoDate, money } from "../../../engine";
import { fmtCzk, fmtPct } from "../../../lib/format";

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

beforeEach(() => {
  act(() => {
    usePortfolioStore.setState({
      portfolio: mixed,
      assumptions,
      status: "ready",
    });
    useUiStore.setState({
      language: "en",
      route: "property",
      selectedPropertyId: "dev",
      asOf: null,
      amortizationOpen: false,
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    });
  });
});

const drawdown = () => screen.getByRole("region", { name: pd.drawdownTitle });

describe("drawdown in the Loan outlook (ADR 0167)", () => {
  it("shows a labelled bar and each draw's status as text", () => {
    render(<PropertyDetail />);
    const bar = within(drawdown()).getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("44");
    expect(bar.getAttribute("aria-valuetext")).toContain(fmtCzk(2000000));
    expect(drawdown().textContent).toContain(
      pd.drawdownProgress(
        fmtCzk(2000000),
        fmtCzk(4500000),
        fmtPct(money(2000000).div(4500000)),
      ),
    );
    const rows = within(drawdown()).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining(pd.drawStatus.drawn),
      expect.stringContaining(pd.drawStatus.ahead),
      expect.stringContaining(pd.drawStatus.ahead),
    ]);
  });

  it("the as-of date moves it, up to fully drawn", () => {
    act(() => useUiStore.setState({ asOf: isoDate("2028-01-01") }));
    render(<PropertyDetail />);
    expect(drawdown().textContent).toContain(pd.drawdownFull(fmtCzk(4500000)));
    expect(
      within(drawdown()).getByRole("progressbar").getAttribute("aria-valuenow"),
    ).toBe("100");
  });

  it("a plain loan has no drawdown section", () => {
    act(() => useUiStore.setState({ selectedPropertyId: "javorova" }));
    render(<PropertyDetail />);
    expect(screen.queryByRole("region", { name: pd.drawdownTitle })).toBeNull();
  });
});
