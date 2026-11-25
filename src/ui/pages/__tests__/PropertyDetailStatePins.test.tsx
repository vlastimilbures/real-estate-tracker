// @vitest-environment jsdom
//
// #484 pins Property detail's outline in each state before its split: which sections show
// and in what order, the subtitle, the top bar's actions and where an activation outcome
// shows (ADR 0107, 0155, 0156, 0248, 0261). The split must leave every one unchanged.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import type { MutationResult } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { money, type Portfolio } from "../../../engine";
import { en } from "../../../i18n/en";

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const pd = en.propertyDetail;
const loan = portfolio.mortgages[0]!;
const owner = portfolio.properties.find((p) => p.id === loan.propertyId)!;
const failure: MutationResult = {
  ok: false,
  error: { kind: "other", message: "Disk full" },
};

function show(
  p: Portfolio,
  id: string,
  setPropertyActive?: () => Promise<MutationResult>,
) {
  act(() => {
    usePortfolioStore.setState({
      portfolio: p,
      assumptions,
      status: { kind: "ready" },
      ...(setPropertyActive ? { setPropertyActive } : {}),
    });
    useUiStore.setState({ route: "property", selectedPropertyId: id });
  });
  render(<PropertyDetail />);
}

/** The page body's top-level blocks: a section by its id, anything else by its class. */
const outline = () =>
  [...screen.getByRole("main").children].map((el) =>
    el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${el.className}`,
  );
const subtitle = () => document.querySelector(".page-sub")?.textContent;
/** The page's own actions in the top bar, before the lens switch. */
const actions = () =>
  within(screen.getByRole("banner"))
    .getAllByRole("button")
    .map((b) => b.textContent)
    .slice(0, 2);

const ALL_SECTIONS = [
  "#pd-overview",
  "#pd-records",
  "#pd-financing",
  "#pd-acquisition",
  "#pd-holding",
  "#pd-projection",
  "#pd-amortization",
  "#pd-dataCheck",
];

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopObserver);
});

describe("Property detail outline per state (#484)", () => {
  it("an owned property with a loan shows every section", () => {
    show(portfolio, owner.id);
    expect(outline()).toEqual(ALL_SECTIONS);
    expect(subtitle()).toBe(
      `${owner.type} · ${pd.sizeM2("71")} · ${pd.purchased("01.06.2015")}`,
    );
    expect(actions()).toEqual([en.properties.editProperty, pd.deactivate]);
    // The overview's heading is for screen readers and takes focus from the nav.
    const overview = document.getElementById("pd-overview")!;
    expect(overview.querySelector("h2.sr-only")?.textContent).toBe(
      pd.sectionOverview,
    );
  });

  it("a pending purchase shows the not-owned panel in the tiles' place (ADR 0156)", () => {
    show(mixed, "future");
    expect(outline()).toEqual(ALL_SECTIONS);
    expect(subtitle()).toBe(pd.pendingPurchase("15.03.2028"));
    expect(actions()).toEqual([en.properties.editProperty, pd.deactivate]);
    const overview = document.getElementById("pd-overview")!;
    expect(within(overview).getByText(pd.notOwnedTitle)).toBeTruthy();
    expect(overview.querySelector(".tile")).toBeNull();
  });

  it("a deactivated property leads with its banner and has no Data check (ADR 0155)", () => {
    show(mixed, "inactive");
    const blocks = outline();
    expect(blocks).toEqual([
      "section.panel",
      ...ALL_SECTIONS.filter((s) => s !== "#pd-dataCheck"),
    ]);
    expect(subtitle()).toBe(
      `${pd.purchased("01.05.2019")} · ${pd.deactivated}`,
    );
    expect(actions()).toEqual([en.properties.editProperty, pd.activate]);
    expect(screen.getByText(pd.inactiveNote)).toBeTruthy();
  });

  it("a development loan's drawdown bar rounds the drawn share to a whole percent", () => {
    show(mixed, "dev");
    const bar = screen.getByRole("progressbar");
    // 2 000 000 drawn of 4 500 000 by 01.10.2026: 44.4 % rounds to 44.
    expect(bar.getAttribute("aria-valuenow")).toBe("44");
    expect(bar.querySelector("span")?.getAttribute("style")).toBe(
      "width: 44%;",
    );
  });

  it("invalid stored data shows the records and no figures (DR-146)", () => {
    const broken: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.id === loan.id ? { ...m, monthlyInstalment: money(1) } : m,
      ),
    };
    show(broken, owner.id);
    expect(outline()).toEqual([
      "div.error-boundary",
      "#pd-records",
      "#pd-financing",
      "#pd-holding",
    ]);
    expect(subtitle()).toBe(`${owner.type} · ${pd.sizeM2("71")}`);
    expect(actions()).toEqual([en.properties.editProperty, pd.deactivate]);
  });
});

describe("where an activation outcome shows (#484, ADR 0261 §2)", () => {
  it("a refused Activate shows its reason in the inactive banner", async () => {
    show(mixed, "inactive", () => Promise.resolve(failure));
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: pd.activate,
      }),
    );
    const banner = screen.getByRole("main").children[0] as HTMLElement;
    expect(within(banner).getByRole("alert").textContent).toContain(
      "Disk full",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("a refused deactivate keeps the confirm row open with the reason, focus on Cancel", async () => {
    show(portfolio, owner.id, () => Promise.resolve(failure));
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: pd.deactivate,
      }),
    );
    const row = screen.getByRole("main").children[0] as HTMLElement;
    expect(
      within(row).getByText(pd.confirmDeactivate(owner.name)),
    ).toBeTruthy();
    await userEvent.click(
      within(row).getByRole("button", { name: pd.yesDeactivate }),
    );
    expect(row.textContent).toContain("Disk full");
    expect(document.activeElement).toBe(
      within(row).getByRole("button", { name: en.common.cancel }),
    );
    await userEvent.click(
      within(row).getByRole("button", { name: en.common.cancel }),
    );
    expect(outline()).toEqual(ALL_SECTIONS);
  });
});
