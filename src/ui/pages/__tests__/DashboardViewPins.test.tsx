// @vitest-environment jsdom
//
// Pins for the Dashboard view refactor (#485), written before it: the filter write-back
// the store sees (ADR 0180 §7), the subtitle and the review pill on both pages (ADR 0218
// §1), the Financing note in both lenses (ADR 0214 §3), the property links (Financing and
// the Properties list, UX-022) and the projection export (ADR 0159).
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const exports: unknown[] = [];
vi.mock("../../exportXlsx", () => ({
  exportTableXlsx: (opts: { filename: string; notes: string[] }) => {
    exports.push({ filename: opts.filename, notes: opts.notes });
    return Promise.resolve({ kind: "saved" });
  },
}));

import { edate, type Portfolio } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { en } from "../../../i18n/en";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { Dashboard } from "../Dashboard";
import { Projections } from "../Projections";
import { Properties } from "../Properties";
import { PropertyDetail } from "../PropertyDetail";

const d = en.dashboard;
const fiveYears = edate(BASE_DATE, 60);
const withDubovaInactive: Portfolio = {
  ...portfolio,
  properties: portfolio.properties.map((p) =>
    p.id === "dubova" ? { ...p, active: false } : p,
  ),
};

/** Record the filter writes, calling through to the store. */
function spyFilter() {
  const real = useUiStore.getState().setDashboardPropertyIds;
  const spy = vi.fn(real);
  act(() => useUiStore.setState({ setDashboardPropertyIds: spy }));
  return spy;
}

function showDashboard(p: Portfolio, ids: string[]) {
  act(() => useUiStore.setState({ dashboardPropertyIds: ids }));
  const spy = spyFilter();
  renderWithPortfolio(<Dashboard />, { portfolio: p, route: "dashboard" });
  return spy;
}

const subtitle = () => document.querySelector(".page-sub")?.textContent;
const pill = () => document.querySelector(".title-pill");

describe("Dashboard filter write-back (ADR 0180 §7)", () => {
  it("writes nothing with no filter or a filter of active properties", () => {
    expect(showDashboard(portfolio, []).mock.calls).toEqual([]);
  });

  it("writes nothing for a hand-picked filter", () => {
    expect(showDashboard(portfolio, ["lipova"]).mock.calls).toEqual([]);
    expect(useUiStore.getState().dashboardPropertyIds).toEqual(["lipova"]);
  });

  it("writes the kept ids once when a filtered property is deactivated", () => {
    const spy = showDashboard(withDubovaInactive, ["lipova", "dubova"]);
    expect(spy.mock.calls).toEqual([[["lipova"]]]);
    expect(useUiStore.getState().dashboardPropertyIds).toEqual(["lipova"]);
    expect(subtitle()).toBe(d.subFilter(1, 2));
  });

  it("writes no filter when the kept ids are every active property, or none", () => {
    expect(
      showDashboard(withDubovaInactive, ["lipova", "javorova", "dubova"]).mock
        .calls,
    ).toEqual([[[]]]);
  });

  it("writes nothing before the portfolio loads, then the kept ids once", () => {
    act(() =>
      useUiStore.setState({ dashboardPropertyIds: ["lipova", "gone"] }),
    );
    const spy = spyFilter();
    render(<Dashboard />);
    expect(spy.mock.calls).toEqual([]);
    act(() =>
      usePortfolioStore.setState({
        portfolio,
        assumptions,
        status: { kind: "ready" },
      }),
    );
    expect(spy.mock.calls).toEqual([[["lipova"]]]);
  });
});

describe("Dashboard subtitle", () => {
  it("is the default with no filter and when every property is kept", () => {
    showDashboard(portfolio, []);
    expect(subtitle()).toBe(d.subtitleDefault);
  });

  it("names a filter of some, and the as-of date off today", () => {
    act(() => useUiStore.setState({ asOf: fiveYears }));
    showDashboard(portfolio, ["lipova"]);
    expect(subtitle()).toBe(`${d.subFilter(1, 3)} · ${d.asOf("07.06.2031")}`);
  });

  it("treats a filter that keeps every active property as no filter", () => {
    showDashboard(portfolio, ["javorova", "lipova", "dubova"]);
    expect(subtitle()).toBe(d.subtitleDefault);
  });
});

describe("the review pill (ADR 0218 §1)", () => {
  it("Dashboard: counts the findings and opens the Data check", () => {
    act(() => useUiStore.setState({ asOf: fiveYears, dataCheckOpen: false }));
    showDashboard(portfolio, []);
    expect(pill()?.getAttribute("aria-label")).toBe(en.dataCheck.reviewPill(6));
    // The one look for findings to review, as the Data check's count (ADR 0268).
    expect(pill()?.className).toBe("chip warn title-pill");
    act(() => fireEvent.click(pill()!));
    expect(useUiStore.getState().dataCheckOpen).toBe(true);
  });

  it("Dashboard: none without findings", () => {
    showDashboard(portfolio, []);
    expect(pill()).toBeNull();
  });

  it("Property detail: the same pill for the property's findings", () => {
    renderWithPortfolio(<PropertyDetail />, { route: "property" });
    act(() =>
      useUiStore.setState({ selectedPropertyId: "lipova", asOf: fiveYears }),
    );
    expect(pill()?.getAttribute("aria-label")).toBe(en.dataCheck.reviewPill(2));
  });
});

describe("Financing note (ADR 0214 §3)", () => {
  const note = () => document.querySelector(".fx-notes")?.textContent;

  it("nominal: the disclaimer", () => {
    showDashboard(mixed, []);
    expect(note()).toBe(d.financingDisclaimer);
  });

  it("real: the nominal note, then the disclaimer, as one paragraph", () => {
    act(() => useUiStore.setState({ mode: "real" }));
    showDashboard(mixed, []);
    expect(note()).toBe(d.financingRowsNominalDisclaimer);
    expect(document.querySelectorAll(".fx-notes p")).toHaveLength(1);
  });
});

describe("property links", () => {
  it("Financing: a name opens the property", () => {
    const open = vi.fn();
    act(() => useUiStore.setState({ openProperty: open }));
    showDashboard(mixed, []);
    const link = document.querySelector(".fx-name .link-button")!;
    expect(link.getAttribute("title")).toBe("Byt Lipova");
    act(() => fireEvent.click(link));
    expect(open.mock.calls).toEqual([["lipova"]]);
  });

  it("Properties: the name opens the property once, not again by the row", () => {
    const open = vi.fn();
    act(() => useUiStore.setState({ openProperty: open }));
    renderWithPortfolio(<Properties />, { route: "properties" });
    act(() =>
      fireEvent.click(screen.getByRole("button", { name: "Byt Lipova" })),
    );
    expect(open.mock.calls).toEqual([["lipova"]]);
  });
});

describe("projection export (ADR 0159)", () => {
  it("Projections: the portfolio's file and notes", () => {
    exports.length = 0;
    renderWithPortfolio(<Projections />, { route: "projections" });
    act(() =>
      fireEvent.click(
        screen.getByRole("button", { name: en.xlsx.exportToExcel }),
      ),
    );
    expect(exports).toEqual([
      {
        filename: "portfolio-projection-nominal.xlsx",
        notes: expect.arrayContaining([en.projections.portfolio]),
      },
    ]);
  });
});
