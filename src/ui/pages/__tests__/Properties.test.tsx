// @vitest-environment jsdom
//
// Properties table: the delete confirmation sits outside the scrolling table so it is
// never clipped, and the actions column stays pinned (UX-019).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Properties } from "../Properties";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import {
  portfolio,
  assumptions,
  withPropertyId,
} from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import {
  isoDate,
  portfolioSnapshot,
  propertySnapshot,
  type Portfolio,
} from "../../../engine";
import { fmtCzk, fmtCzkM, fmtDscr, fmtPct, noBreak } from "../../../lib/format";
import { dscrBandWord, ltvBandWord } from "../../model/health";
import type { Decimal } from "../../../lib/money";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { setClock } from "../../../__tests__/support/clock";
import { success } from "../../../__tests__/support/result";

beforeEach(() => setClock("2026-10-01"));

const en = getDict("en");
const first = portfolio.properties[0]!;

/** The Properties page on `p` (default: the sample). */
const show = (p: Portfolio = portfolio) =>
  renderWithPortfolio(<Properties />, { portfolio: p, route: "properties" });

describe("Properties delete confirmation (UX-019)", () => {
  it("shows below the table, outside the scrolling area", async () => {
    show();
    const deletes = screen.getAllByRole("button", { name: en.common.delete });
    await userEvent.click(deletes[0]!);
    const msg = screen.getByText(en.properties.confirmDelete(first.name));
    expect(msg.closest(".table-wrap")).toBeNull();
    expect(msg.closest("table")).toBeNull();
  });

  it("Cancel closes it without deleting", async () => {
    const removeProperty = vi.fn();
    act(() => usePortfolioStore.setState({ removeProperty }));
    show();
    await userEvent.click(
      screen.getAllByRole("button", { name: en.common.delete })[0]!,
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(removeProperty).not.toHaveBeenCalled();
    expect(
      screen.queryByText(en.properties.confirmDelete(first.name)),
    ).toBeNull();
  });

  it("Yes, delete removes the named property", async () => {
    const removeProperty = vi.fn(async () => ({ ok: true as const }));
    act(() => usePortfolioStore.setState({ removeProperty }));
    show();
    await userEvent.click(
      screen.getAllByRole("button", { name: en.common.delete })[0]!,
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(removeProperty).toHaveBeenCalledWith(first.id);
  });

  it("pins the actions column", () => {
    show();
    const cell = screen
      .getAllByRole("button", { name: en.common.delete })[0]!
      .closest("td")!;
    expect(cell.className).toContain("actions-col");
  });
});

// #248 (ADR 0173): a delete that lands closes the confirm, even one opened again
// meanwhile. In the app the row actions are disabled while it runs (ADR 0253); this
// page's delete is a stub, so they stay enabled here.
describe("Properties: a late delete closes only its own confirm (#248)", () => {
  // Once the delete lands the property is gone, so its confirm opened again meanwhile
  // (X, then Y, then X) names nothing and closes with it.
  it("closes the deleted property's confirm opened again meanwhile", async () => {
    let finish: (r: MutationResult) => void = () => undefined;
    const removeProperty = vi.fn(
      () => new Promise<MutationResult>((r) => (finish = r)),
    );
    act(() => usePortfolioStore.setState({ removeProperty }));
    show();
    const deletes = () =>
      screen.getAllByRole("button", { name: en.common.delete });
    await userEvent.click(deletes()[0]!);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    await userEvent.click(deletes()[1]!);
    await userEvent.click(deletes()[0]!);
    await act(async () => finish({ ok: true }));
    expect(
      screen.queryByText(en.properties.confirmDelete(first.name)),
    ).toBeNull();
  });
});

describe("Properties keyboard drill-in (UX-022)", () => {
  it("the property name is a button that opens the property", async () => {
    show();
    const name = screen.getByRole("button", { name: first.name });
    name.focus();
    await userEvent.keyboard("{Enter}");
    expect(useUiStore.getState().route).toBe("property");
    expect(useUiStore.getState().selectedPropertyId).toBe(first.id);
  });

  it("Space on the name opens it too", async () => {
    show();
    screen.getByRole("button", { name: first.name }).focus();
    await userEvent.keyboard(" ");
    expect(useUiStore.getState().selectedPropertyId).toBe(first.id);
  });
});

describe("Properties long names and narrow windows (ADR 0085)", () => {
  it("truncates the name but keeps the full name on hover and for screen readers", () => {
    show();
    const name = screen.getByRole("button", { name: first.name });
    expect(name.className).toContain("cell-name");
    expect(name.getAttribute("title")).toBe(first.name);
  });

  it("puts the risk and cash-flow columns right after the name", () => {
    show();
    const headers = screen
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    const p = en.properties;
    expect(headers).toEqual([
      p.colProperty,
      p.colLtv,
      p.colNetCashFlow,
      p.colDscr,
      p.colValue,
      p.colDebt,
      p.colEquity,
      p.colNoi,
      en.common.actions, // sr-only (ADR 0157)
    ]);
  });

  it("row actions keep their names as icon-only buttons (ADR 0199)", () => {
    show();
    for (const label of [en.common.edit, en.common.delete]) {
      const button = screen.getAllByRole("button", { name: label })[0]!;
      expect(button.querySelector(".row-action-tip")?.textContent).toBe(label);
    }
  });
});

describe("Properties context line (ADR 0111, #21)", () => {
  it("names the as-of date, the currency and the flow period", () => {
    show();
    expect(
      screen.getByText(
        `${en.properties.subtitle(portfolio.properties.length)} · as of 01.10.2026 · amounts in Kč, flows per year`,
      ),
    ).toBeTruthy();
  });
});

describe('A property stored with the id "" (ADR 0127)', () => {
  it("opens the edit form filled in", async () => {
    act(() =>
      usePortfolioStore.setState({
        getPropertyExtras: () =>
          Promise.resolve(success({ address: null, garage: null })),
      }),
    );
    show(withPropertyId(first.id, ""));
    const row = screen.getByRole("button", { name: first.name }).closest("tr")!;
    await userEvent.click(
      within(row).getByRole("button", { name: en.common.edit }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue(first.name)).toBeTruthy();
  });
});

// ADR 0169: a development flat under construction lists its drawn debt and its value less
// the tranches not drawn yet; equity is unchanged.
describe("Properties: development flat under construction (ADR 0169)", () => {
  it("lists the reported value and the drawn debt", () => {
    const only = <T extends { propertyId: string }>(rows: T[]) =>
      rows.filter((r) => r.propertyId === "dev");
    const devOnly: Portfolio = {
      properties: mixed.properties.filter((p) => p.id === "dev"),
      mortgages: only(mixed.mortgages),
      valuations: only(mixed.valuations),
      leases: only(mixed.leases),
      holdingCosts: [],
    };
    show(devOnly);
    const dev = devOnly.properties[0]!;
    const s = propertySnapshot(
      dev,
      devOnly,
      assumptions,
      isoDate("2026-10-01"),
    );
    expect(s.undrawnDebt.isZero()).toBe(false);
    const row = screen.getByRole("button", { name: dev.name }).closest("tr");
    if (!(row instanceof HTMLElement)) throw new Error("no dev row");
    const cells = within(row)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    const money = (v: Decimal) => fmtCzk(v, { suffix: false });
    expect(cells).toContain(money(s.reportedValue));
    // The drawn debt, with the tranches still to draw named under it.
    expect(cells).toContain(
      money(s.debt) + en.common.undrawnDebt(noBreak(fmtCzkM(s.undrawnDebt))),
    );
    expect(cells.join()).not.toContain(money(s.committedDebt));
  });
});

// ADR 0205 (#379): plain figures with a health marker, a legend, and a totals row equal to
// the Dashboard tiles at Today with "All".
describe("Properties list fits (ADR 0205)", () => {
  const p = en.properties;
  const money = (v: Decimal) => fmtCzk(v, { suffix: false });
  const asOf = isoDate("2026-10-01");

  it("shows LTV and DSCR as figures with a health marker, the band word for screen readers", () => {
    show();
    const s = propertySnapshot(first, portfolio, assumptions, asOf);
    const row = screen.getByRole("button", { name: first.name }).closest("tr")!;
    const [, ltv, , dscr] = within(row).getAllByRole("cell");
    for (const [cell, figure, word] of [
      [ltv!, fmtPct(s.ltv!), ltvBandWord(en, s.ltv)!],
      [dscr!, fmtDscr(s.dscr!), dscrBandWord(en, s.dscr)!],
    ] as const) {
      expect(cell.querySelector(".badge")).toBeNull();
      const marker = cell.querySelector(".health-marker")!;
      expect(marker).not.toBeNull();
      expect(marker.getAttribute("title")).toBe(word);
      expect(cell.textContent).toBe(`${figure} ${word}`);
    }
  });

  it("explains the markers in a legend hidden from assistive technology", () => {
    const { container } = show();
    const legend = container.querySelector(".band-legend")!;
    expect(legend.getAttribute("aria-hidden")).toBe("true");
    for (const w of [
      en.dashboard.badgeConservative,
      en.dashboard.badgeModerate,
      en.dashboard.badgeHigh,
      en.dashboard.badgeCoversDebt,
      en.dashboard.badgeShortfall,
    ])
      expect(legend.textContent).toContain(w);
  });

  it("adds a totals row equal to the Dashboard at Today with All", () => {
    show();
    const s = portfolioSnapshot(portfolio, assumptions, asOf);
    const foot = screen
      .getByRole("rowheader", { name: p.totalRow })
      .closest("tr")!;
    expect(foot.closest("tfoot")).not.toBeNull();
    const cells = within(foot)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual([
      `${fmtPct(s.ltv!)} ${ltvBandWord(en, s.ltv)}`,
      // Flows and equity in accounting parentheses when negative, as in the rows.
      fmtCzk(s.netCashFlow, { parens: true, suffix: false }),
      `${fmtDscr(s.dscr!)} ${dscrBandWord(en, s.dscr)}`,
      money(s.totalReportedValue),
      money(s.totalDebt),
      fmtCzk(s.totalEquity, { parens: true, suffix: false }),
      money(s.noi),
      "",
    ]);
  });

  it("names the total of the active properties when one is inactive", () => {
    show({
      ...portfolio,
      properties: portfolio.properties.map((x, i) =>
        i === 0 ? { ...x, active: false } : x,
      ),
    });
    expect(
      screen.getByRole("rowheader", { name: p.totalRowActive }),
    ).toBeTruthy();
  });

  it("keeps the total nominal with the real lens on: the page has no lens", () => {
    act(() => useUiStore.setState({ mode: "real" }));
    show();
    const s = portfolioSnapshot(portfolio, assumptions, asOf);
    const foot = screen
      .getByRole("rowheader", { name: p.totalRow })
      .closest("tr")!;
    const cells = within(foot)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells[3]).toBe(money(s.totalReportedValue));
    expect(cells[4]).toBe(money(s.totalDebt));
  });

  it("leaves a pending purchase's value out of the total, names the undrawn debt", () => {
    show(mixed);
    const s = portfolioSnapshot(mixed, assumptions, asOf);
    const foot = screen
      .getByRole("rowheader", { name: p.totalRowOwned })
      .closest("tr")!;
    const cells = within(foot)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    // The owned, active properties' values: not "future" (bought in 2028), not the
    // inactive one.
    const owned = mixed.properties
      .filter((x) => x.id !== "future" && x.active !== false)
      .map((x) => propertySnapshot(x, mixed, assumptions, asOf).reportedValue);
    expect(s.totalReportedValue.equals(owned.reduce((x, y) => x.plus(y)))).toBe(
      true,
    );
    expect(cells[3]).toBe(money(s.totalReportedValue));
    expect(cells[4]).toBe(
      money(s.totalDebt) +
        en.common.undrawnDebt(noBreak(fmtCzkM(s.totalUndrawnDebt))),
    );
  });

  it("has no legend when no row shows a marker", () => {
    const own = <T extends { propertyId: string }>(rows: T[]) =>
      rows.filter((r) => r.propertyId === "future");
    const { container } = show({
      properties: mixed.properties.filter((x) => x.id === "future"),
      mortgages: own(mixed.mortgages),
      valuations: own(mixed.valuations),
      leases: own(mixed.leases),
      holdingCosts: [],
    });
    expect(container.querySelector(".band-legend")).toBeNull();
  });

  it("has no totals row for one property", () => {
    const own = <T extends { propertyId: string }>(rows: T[]) =>
      rows.filter((r) => r.propertyId === first.id);
    show({
      properties: [first],
      mortgages: own(portfolio.mortgages),
      valuations: own(portfolio.valuations),
      leases: own(portfolio.leases),
      holdingCosts: own(portfolio.holdingCosts),
    });
    expect(screen.queryByRole("rowheader")).toBeNull();
  });
});
