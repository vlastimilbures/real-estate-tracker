// @vitest-environment jsdom
//
// ADR 0103 (#31): the Dashboard "Financing & upcoming" panel.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  debtResettingWithin,
  isoDate,
  portfolioOutputs,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { fmtCzk } from "../../../lib/format";
import type { Decimal } from "../../../lib/money";
import type { Mode } from "../../model/lens";
import { FinancingPanel } from "../DashboardFinancing";

const N = assumptions.horizonYears;

function renderPanel(
  p: Portfolio,
  mode: Mode = "nominal",
  asOf = assumptions.baseDate,
) {
  const out = portfolioOutputs(p, assumptions, asOf);
  const onOpen = vi.fn();
  const view = render(
    <FinancingPanel
      fx={out.financing}
      portfolio={p}
      kpis={out.kpis}
      mode={mode}
      horizonYears={N}
      onOpenProperty={onOpen}
    />,
  );
  return { out, onOpen, view };
}

const money = (d: Decimal) => fmtCzk(d);

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Financing & upcoming panel (ADR 0103)", () => {
  it("shows the next reset, its balance, debt resetting in 3 y and total interest", () => {
    const { out } = renderPanel(portfolio);
    const three = debtResettingWithin(out.financing, 3);
    expect(screen.getByText(en.dashboard.financingTitle)).toBeTruthy();
    expect(screen.getByText(/15\.01\.2029/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Byt Lipova" })).toBeTruthy();
    expect(screen.getAllByText(money(three.amount)).length).toBeGreaterThan(0);
    expect(
      screen.getByText(en.dashboard.financingResettingWithin(3)),
    ).toBeTruthy();
    expect(
      screen.getByText(en.dashboard.financingTotalInterest(N)),
    ).toBeTruthy();
    expect(screen.getByText(money(out.kpis.totalInterest))).toBeTruthy();
  });

  it("says the dates are modelled, not lender deadlines", () => {
    renderPanel(portfolio);
    expect(screen.getByText(en.dashboard.financingDisclaimer)).toBeTruthy();
    expect(
      screen.getByText(en.dashboard.financingHint("07.06.2026")),
    ).toBeTruthy();
  });

  it("the window toggle changes the debt resetting figure", async () => {
    const user = userEvent.setup();
    const { out } = renderPanel(portfolio);
    const group = screen.getByRole("group", {
      name: en.dashboard.financingWindow,
    });
    await user.click(within(group).getByRole("button", { name: "5 y" }));
    const five = debtResettingWithin(out.financing, 5);
    expect(
      screen.getByText(en.dashboard.financingResettingWithin(5)),
    ).toBeTruthy();
    expect(screen.getByText(money(five.amount), { exact: false })).toBeTruthy();
    expect(screen.getByText(/3 loans/)).toBeTruthy();
  });

  it("a property link opens the property", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderPanel(portfolio);
    await user.click(screen.getByRole("button", { name: "Byt Lipova" }));
    expect(onOpen).toHaveBeenCalledWith("lipova");
  });

  it("real lens: balances say nominal, total interest is real", () => {
    const { out } = renderPanel(portfolio, "real");
    expect(
      screen.getByText(en.dashboard.financingBalanceAtResetNominal),
    ).toBeTruthy();
    expect(
      screen.getByText(en.dashboard.financingTotalInterestReal(N)),
    ).toBeTruthy();
    expect(screen.getByText(money(out.kpis.totalInterestReal))).toBeTruthy();
  });

  it("no events: says nothing is modelled in the next 12 months", () => {
    renderPanel(portfolio);
    expect(screen.getByText(en.dashboard.financingNoEvents)).toBeTruthy();
  });

  it("no loans: no figures or toggle, events still listed", () => {
    const p = {
      ...portfolio,
      mortgages: [],
      leases: portfolio.leases.filter((l) => l.id !== "l-lipova-2"),
    };
    renderPanel(p);
    expect(screen.getByText(en.dashboard.financingNoLoans)).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByText(en.dashboard.financingEventLeaseEnd)).toBeTruthy();
  });

  it("at a later as-of it does not say today or current", () => {
    const { view } = renderPanel(portfolio, "nominal", isoDate("2031-06-07"));
    expect(view.container.textContent).not.toMatch(/today|current/i);
  });
});
