// @vitest-environment jsdom
//
// ADR 0103 (#31): the Dashboard "Financing & upcoming" panel.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  debtResettingWithin,
  isoDate,
  money as moneyOf,
  portfolioOutputs,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { fmtCzk } from "../../../lib/format";
import type { Decimal } from "../../../lib/money";
import type { Mode } from "../../model/lens";
import { FinancingPanel } from "../DashboardFinancing";
import { useUiStore } from "../../../state/uiStore";

const N = assumptions.horizonYears;

function renderPanel(
  p: Portfolio,
  mode: Mode = "nominal",
  asOf = assumptions.baseDate,
) {
  const out = portfolioOutputs(p, assumptions, asOf);
  // A property's name opens it through the ui store.
  const onOpen = vi.fn();
  useUiStore.setState({ openProperty: onOpen });
  const view = render(
    <FinancingPanel
      fx={out.financing}
      portfolio={p}
      kpis={out.kpis}
      mode={mode}
      horizonYears={N}
    />,
  );
  return { out, onOpen, view };
}

const money = (d: Decimal) => fmtCzk(d);

describe("Financing & upcoming panel (ADR 0103)", () => {
  it("shows the next reset, its balance, debt resetting in 3 y and total interest", () => {
    const { out } = renderPanel(portfolio);
    const three = debtResettingWithin(out.financing, 3);
    expect(screen.getByText(en.dashboard.financingTitle)).toBeTruthy();
    expect(screen.getAllByText(/15\.01\.2029/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Byt Lipova" }).length,
    ).toBeGreaterThan(0);
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
    for (const link of screen.getAllByRole("button", { name: "Byt Lipova" })) {
      onOpen.mockClear();
      await user.click(link);
      expect(onOpen).toHaveBeenCalledWith("lipova");
    }
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

  it("no loans: no figures, the note, and a property's other dates still listed", () => {
    const p = {
      ...portfolio,
      mortgages: [],
      leases: portfolio.leases.filter((l) => l.id !== "l-lipova-2"),
    };
    renderPanel(p);
    expect(screen.getByText(en.dashboard.financingNoLoans)).toBeTruthy();
    expect(screen.queryByText(en.dashboard.financingNextReset)).toBeNull();
    const list = screen.getByRole("list", {
      name: en.dashboard.financingTimeline(3),
    });
    expect(within(list).getByRole("listitem").textContent).toContain(
      en.dashboard.financingEventLeaseEnd,
    );
    // The window sets the span of those dates (ADR 0204 §4).
    expect(
      screen.getByRole("group", { name: en.dashboard.financingWindow }),
    ).toBeTruthy();
  });

  it("no loans and no dates: the note only, no toggle", () => {
    renderPanel({ ...portfolio, mortgages: [] });
    expect(screen.getByText(en.dashboard.financingNoLoans)).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("at a later as-of it does not say today or current", () => {
    const { view } = renderPanel(portfolio, "nominal", isoDate("2031-06-07"));
    expect(view.container.textContent).not.toMatch(/today|current/i);
  });
});

describe("interest saved (ADR 0116)", () => {
  const prepaid: Portfolio = {
    ...portfolio,
    mortgages: portfolio.mortgages.map((m) =>
      m.propertyId === "lipova"
        ? {
            ...m,
            prepayments: [
              {
                date: isoDate("2029-01-15"),
                amount: moneyOf(300000),
                effect: "lowerInstalment" as const,
              },
            ],
          }
        : m,
    ),
  };

  it("is hidden without a prepayment", () => {
    renderPanel(portfolio);
    expect(screen.queryByText(en.dashboard.financingInterestSaved)).toBeNull();
  });

  it("shows the total, and each property in a disclosure that opens the property", async () => {
    const { out, onOpen, view } = renderPanel(prepaid, "real");
    const saved = out.financing.loans.find(
      (l) => l.propertyId === "lipova",
    )!.interestSaved!;
    expect(screen.getByText(en.dashboard.financingInterestSaved)).toBeTruthy();
    expect(screen.getAllByText(money(saved)).length).toBe(2);
    // One disclosure button (ADR 0203), shut at first; its region names each property.
    const toggle = within(view.container).getByRole("button", {
      name: en.dashboard.financingInterestSavedByProperty,
      expanded: false,
    });
    const region = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    )!;
    expect(region.hidden).toBe(true);
    await userEvent.click(toggle);
    expect(region.hidden).toBe(false);
    await userEvent.click(
      within(region).getByRole("button", { name: "Byt Lipova" }),
    );
    expect(onOpen).toHaveBeenCalledWith("lipova");
  });

  // ADR 0144: the label names its window, which is not the "Yrs 1–N" of total interest.
  it("the label names the cause and the loans' remaining life (#172)", () => {
    renderPanel(prepaid);
    expect(
      screen.getByText(
        "Interest saved by prepayments over the loans' remaining life (nominal)",
      ),
    ).toBeTruthy();
  });
});

describe("interest saved with a recast that needs the prepayment (ADR 0130)", () => {
  // A 300,000 Kč prepayment and a recast to a 5,000 Kč instalment on one date: the
  // engine's figure is negative, so the panel shows the note instead of an amount.
  const recast: Portfolio = {
    ...portfolio,
    mortgages: portfolio.mortgages.map((m) =>
      m.propertyId === "javorova"
        ? {
            ...m,
            prepayments: [
              {
                date: isoDate("2031-01-17"),
                amount: moneyOf(300000),
                effect: "lowerInstalment" as const,
              },
            ],
            recasts: [
              { date: isoDate("2031-01-17"), instalment: moneyOf(5000) },
            ],
          }
        : m,
    ),
  };

  it("shows n/a for the total and the property, never the negative amount", () => {
    const { out, view } = renderPanel(recast);
    const saved = out.financing.loans.find(
      (l) => l.propertyId === "javorova",
    )!.interestSaved!;
    expect(saved.isNegative()).toBe(true);
    expect(screen.getByText(en.dashboard.financingInterestSaved)).toBeTruthy();
    expect(
      screen.getAllByText(en.dashboard.financingInterestSavedNa).length,
    ).toBe(2);
    expect(view.container.textContent).not.toContain(money(saved));
    expect(view.container.textContent).not.toContain(money(saved.negated()));
  });
});

describe("fixation timeline (ADR 0204)", () => {
  const d = en.dashboard;
  const list = (n = 3) =>
    screen.getByRole("list", { name: d.financingTimeline(n) });
  const items = (n = 3) => within(list(n)).getAllByRole("listitem");

  it("lists one row per loan, earliest fixation end first, with every date and amount in its text", () => {
    const { out } = renderPanel(portfolio);
    const rows = items();
    expect(rows.map((r) => within(r).getByRole("button").textContent)).toEqual([
      "Byt Lipova",
      "Byt Javorova",
      "Byt Dubova",
    ]);
    const balance = (id: string) =>
      out.financing.loans.find((l) => l.propertyId === id)!.nextFixation!
        .balance;
    expect(rows[0].textContent).toContain(d.financingEventFixationEnd);
    expect(rows[0].textContent).toContain("15.01.2029");
    expect(rows[0].textContent).toContain(d.financingIn("2 yrs 7 months"));
    expect(rows[0].textContent).toContain(money(balance("lipova")));
    expect(rows[0].textContent).toContain(d.financingNextFlag);
    // After the window: still listed with its date and debt, not flagged.
    expect(rows[1].textContent).toContain("17.01.2031");
    expect(rows[1].textContent).toContain(money(balance("javorova")));
    expect(rows[1].textContent).not.toContain(d.financingNextFlag);
  });

  it("hides the bars, markers, axis and legend from assistive technology", () => {
    const { view } = renderPanel(portfolio);
    for (const sel of [".fx-track", ".fx-axis", ".fx-legend"]) {
      const els = view.container.querySelectorAll(sel);
      expect(els.length, sel).toBeGreaterThan(0);
      for (const el of els)
        expect(el.closest("[aria-hidden='true']"), sel).not.toBeNull();
    }
    // The next reset's bar is inside the window; a later one runs off the edge.
    const bars = view.container.querySelectorAll<HTMLElement>(".fx-bar");
    expect(bars[0].classList.contains("beyond")).toBe(false);
    expect(bars[1].classList.contains("beyond")).toBe(true);
    expect(bars[1].style.width).toBe("100%");
  });

  it("the window sets the axis and which dates show", async () => {
    const user = userEvent.setup();
    const p = {
      ...portfolio,
      leases: portfolio.leases
        .map((l) =>
          l.id === "l-lipova-1" ? { ...l, endDate: isoDate("2028-05-31") } : l,
        )
        .filter((l) => l.id !== "l-lipova-2"),
    };
    const { view } = renderPanel(p);
    const ticks = () =>
      Array.from(view.container.querySelectorAll(".fx-tick")).map(
        (x) => x.textContent,
      );
    expect(ticks()).toEqual(["2027", "2028", "2029"]);
    expect(items()[0].textContent).toContain("31.05.2028");
    await user.click(screen.getByRole("button", { name: "1 y" }));
    expect(ticks()).toEqual(["2027"]);
    expect(items(1)[0].textContent).not.toContain("31.05.2028");
  });

  it("a Table toggle shows the same dates as a table", async () => {
    const user = userEvent.setup();
    renderPanel(portfolio);
    const toggle = screen.getByRole("button", { name: en.charts.table });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    const table = screen.getByRole("table", { name: d.financingTimeline(3) });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      d.financingColProperty,
      d.financingColEvent,
      d.financingColDate,
      d.financingColIn,
      d.financingColDebt,
    ]);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(
      screen.queryByRole("list", { name: d.financingTimeline(3) }),
    ).toBeNull();
  });

  it("shows 8 rows and the rest under Show all", async () => {
    const props = Array.from({ length: 11 }, (_, i) => ({
      ...portfolio.properties[0],
      id: `p${i}`,
      name: `Byt Ukazkovy ${String(i + 1).padStart(2, "0")}`,
    }));
    const base = portfolio.mortgages[0];
    const p: Portfolio = {
      ...portfolio,
      properties: props,
      mortgages: props.map((x, i) => ({
        ...base,
        id: `m${i}`,
        propertyId: x.id,
        startDate: isoDate(`${2020 + (i % 6)}-0${1 + (i % 9)}-15`),
      })),
      valuations: [],
      holdingCosts: [],
      leases: [],
    };
    renderPanel(p);
    const lists = screen.getAllByRole("list", { name: d.financingTimeline(3) });
    expect(within(lists[0]).getAllByRole("listitem")).toHaveLength(8);
    const more = screen.getByRole("button", { name: d.financingShowAll(11) });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(
      more.getAttribute("aria-controls")!,
    )!;
    expect(region.hidden).toBe(true);
    await userEvent.click(more);
    expect(region.hidden).toBe(false);
    expect(within(region).getAllByRole("listitem")).toHaveLength(3);
  });

  it("says when a loan has no fixation end ahead", () => {
    renderPanel(portfolio, "nominal", isoDate("2029-06-01"));
    const lipova = items().find((r) => r.textContent?.includes("Byt Lipova"))!;
    expect(lipova.textContent).toContain(d.financingNoFixationAhead);
  });

  it("real lens: says the debt in the rows is nominal", () => {
    const { container } = renderPanel(portfolio, "real").view;
    // ADR 0214 §3: one note, the nominal line leading the disclaimer.
    const notes = [...container.querySelectorAll(".fx-notes .panel-note")];
    expect(notes.map((n) => n.textContent)).toEqual([
      `${d.financingRowsNominal} ${d.financingDisclaimer}`,
    ]);
  });
});
