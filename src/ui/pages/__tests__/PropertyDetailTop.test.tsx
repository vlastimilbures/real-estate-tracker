// @vitest-environment jsdom
//
// ADR 0215 (#384): Property detail's way back is a "Properties" breadcrumb before the
// actions, and its tiles are the Dashboard strip's compact tiles in one row of six.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { PropertyDetail } from "../PropertyDetail";
import { PropertySnapshotTiles } from "../propertyDetail/PropertySnapshotTiles";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { propertySnapshot } from "../../../engine";
import { portfolioSnapshot } from "../../../engine/__tests__/support/seams";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { monthlyFlow } from "../../model/dashboard";
import { fmtCzk } from "../../../lib/format";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { setClock } from "../../../__tests__/support/clock";

beforeEach(() => setClock("2026-10-01"));

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const p = portfolio.properties[0]!;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
    });
    useUiStore.setState({
      route: "property",
      selectedPropertyId: p.id,
    });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("breadcrumb (ADR 0215 §1)", () => {
  it("a 'Properties' link before the actions replaces the All properties button", () => {
    render(<PropertyDetail />);
    const bar = screen.getByRole("banner");
    const crumb = within(bar).getByRole("link", { name: en.nav.properties });
    const edit = within(bar).getByRole("button", {
      name: en.properties.editProperty,
    });
    // Before the actions in the focus order.
    expect(
      crumb.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(bar).queryByRole("button", { name: /All properties/ })).toBe(
      null,
    );
    // Before the property's name.
    const title = within(bar).getByRole("heading", { level: 1 });
    expect(title.textContent).toBe(p.name);
    expect(
      crumb.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("returns to the Properties list", () => {
    render(<PropertyDetail />);
    fireEvent.click(screen.getByRole("link", { name: en.nav.properties }));
    expect(useUiStore.getState().route).toBe("properties");
  });

  it("with unsaved edits it asks first, as every way off the page does", () => {
    render(<PropertyDetail />);
    act(() =>
      useUiStore.setState({ unsavedSources: ["test"], pendingLeave: null }),
    );
    fireEvent.click(screen.getByRole("link", { name: en.nav.properties }));
    expect(useUiStore.getState().route).toBe("property");
    expect(useUiStore.getState().pendingLeave).not.toBeNull();
    act(() => useUiStore.setState({ unsavedSources: [], pendingLeave: null }));
  });
});

describe("actions (ADR 0215 §2)", () => {
  it("Edit property first, then Deactivate, whose label stays its name", () => {
    render(<PropertyDetail />);
    const bar = screen.getByRole("banner");
    const edit = within(bar).getByRole("button", {
      name: en.properties.editProperty,
    });
    const deactivate = within(bar).getByRole("button", {
      name: en.propertyDetail.deactivate,
    });
    expect(
      edit.compareDocumentPosition(deactivate) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Narrow windows hide the label visually only (CSS), never from the name.
    expect(deactivate.querySelector(".narrow-hide")?.textContent).toBe(
      en.propertyDetail.deactivate,
    );
  });
});

describe("tiles (ADR 0215 §3)", () => {
  const labels = [
    en.propertyDetail.marketValue,
    en.propertyDetail.debt,
    en.propertyDetail.equity,
    en.propertyDetail.ltv,
    en.propertyDetail.dscr,
    en.dashboard.stripNetCashFlow,
  ];

  it("are one band of six cells in one group, captioned with the basis (ADR 0222 §4)", () => {
    const { container } = render(<PropertyDetail />);
    const strip = container.querySelector(".kpi-strip-wrap .kpi-band")!;
    expect(strip).not.toBeNull();
    const tiles = [...strip.querySelectorAll(".tile")];
    expect(tiles.every((tl) => tl.classList.contains("compact"))).toBe(true);
    expect(tiles.map((tl) => tl.querySelector(".label")?.textContent)).toEqual(
      labels,
    );
    const groups = strip.querySelectorAll(":scope > [role=group]");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.querySelector(".kpi-band-caption")?.textContent).toBe(
      "Current",
    );
  });

  it("LTV and DSCR are tiles with their markers; Debt's foot no longer holds LTV", () => {
    const { container } = render(<PropertyDetail />);
    const tiles = [...container.querySelectorAll(".kpi-band .tile")];
    const debt = tiles[1]!;
    expect(debt.querySelector(".foot")).toBeNull();
    for (const i of [3, 4]) {
      expect(tiles[i]!.querySelector(".foot .health-marker")).not.toBeNull();
    }
  });

  it("net cash flow is per month, with the year in the foot", () => {
    const s = propertySnapshot(p, portfolio, assumptions);
    render(
      <PropertySnapshotTiles
        s={s}
        chartRows={[]}
        modeWord="nominal"
        basis={{ kind: "today" }}
      />,
    );
    const tile = screen
      .getByText(en.dashboard.stripNetCashFlow)
      .closest(".tile") as HTMLElement;
    const value = tile.querySelector(".value")!;
    expect(value.textContent).toBe(
      `${fmtCzk(monthlyFlow(s).net)}${en.dashboard.perMonth}`,
    );
    expect(tile.querySelector(".foot")?.textContent).toBe(
      `${fmtCzk(s.netCashFlow)}${en.dashboard.perYear}`,
    );
  });
});

describe("net cash flow in a projection year, real lens (ADR 0215 §3)", () => {
  it("names the projection year, and its month is its year ÷ 12", () => {
    act(() =>
      useUiStore.setState({
        mode: "real",
        asOf: new Date(Date.UTC(2031, 5, 7)),
      }),
    );
    const { container } = render(<PropertyDetail />);
    const tile = [...container.querySelectorAll(".kpi-band .tile")].find(
      (tl) =>
        tl.querySelector(".label")?.textContent ===
        en.dashboard.stripNetCashFlow,
    )!;
    // The basis is the band's caption (ADR 0222 §4).
    const caption = container.querySelector(".kpi-band-caption")!.textContent!;
    expect(caption.toLowerCase()).toContain(
      en.dashboard.basisProjection("").trim(),
    );
    const num = (s: string) => {
      const neg = s.includes("(");
      const n = Number(s.replace(/[^0-9]/g, ""));
      return neg ? -n : n;
    };
    const monthly = num(tile.querySelector(".value .num")!.textContent!);
    const yearly = num(tile.querySelector(".foot .num")!.textContent!);
    // Rounded to whole Kč for display, so the year is within 12 Kč of 12 months.
    expect(Math.abs(monthly * 12 - yearly)).toBeLessThanOrEqual(12);
  });
});

describe("monthlyFlow on a property (ADR 0215 §3)", () => {
  it("is the annual net cash flow ÷ 12, as the Dashboard's", () => {
    const s = propertySnapshot(p, portfolio, assumptions);
    expect(monthlyFlow(s).net.times(12).toFixed(6)).toBe(
      s.netCashFlow.toFixed(6),
    );
    // The portfolio's still works.
    const ps = portfolioSnapshot(portfolio, assumptions);
    expect(monthlyFlow(ps).net.times(12).toFixed(6)).toBe(
      ps.netCashFlow.toFixed(6),
    );
  });
});

describe("dictionary (ADR 0215 Consequences)", () => {
  it("the All properties button's key is gone", () => {
    for (const t of [en, cs, ru]) {
      expect("allProperties" in t.propertyDetail).toBe(false);
      expect("netCf" in t.propertyDetail).toBe(false);
    }
  });
});

// ADR 0236 §2: a size with one decimal place shows with Czech formatting.
describe("size in the subtitle (ADR 0236 §2)", () => {
  const withSize = (sizeM2: number) =>
    act(() =>
      usePortfolioStore.setState({
        portfolio: {
          ...portfolio,
          properties: portfolio.properties.map((q) =>
            q.id === p.id ? { ...q, sizeM2 } : q,
          ),
        },
      }),
    );

  it("reads 54,5 m² in Czech", () => {
    act(() => useUiStore.setState({ language: "cs" }));
    withSize(54.5);
    render(<PropertyDetail />);
    expect(screen.getByRole("banner").textContent).toContain("54,5 m²");
  });

  it("a whole size shows no decimals", () => {
    withSize(58);
    render(<PropertyDetail />);
    const text = screen.getByRole("banner").textContent ?? "";
    expect(text).toContain("58 m²");
    expect(text).not.toContain("58,0");
  });

  it("groups thousands, as fmtNumber does", () => {
    withSize(1234);
    render(<PropertyDetail />);
    const text = screen.getByRole("banner").textContent ?? "";
    expect(text.replace(/\s/g, " ")).toContain("1 234 m²");
  });
});
