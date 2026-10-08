// @vitest-environment jsdom
//
// ADR 0107 (#23): Property detail has an in-page section nav (focus moves to the section
// heading, the section in view is aria-current) and a collapsed amortization schedule
// whose export stays available. ADR 0118 (#35) adds the Data check section, whose fix
// links move to the section that fixes a finding, also when opened from the Dashboard.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import {
  portfolio,
  assumptions,
  withPropertyId,
} from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { isoDate, money } from "../../../engine";
import { fmtCzk } from "../../../lib/format";

vi.mock("../../../data/errorLog", () => ({ logFailure: vi.fn() }));

const loan = portfolio.mortgages[0];
const owner = portfolio.properties.find((p) => p.id === loan.propertyId)!;
const pd = en.propertyDetail;

/** Captures the page's observers so a test can say which sections are in view. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets: Element[] = [];
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function inView(id: string) {
  const observer = FakeObserver.all.find((o) =>
    o.targets.some((t) => t.id === id),
  )!;
  const target = observer.targets.find((t) => t.id === id)!;
  act(() =>
    observer.callback(
      [
        {
          target,
          isIntersecting: true,
        } as unknown as IntersectionObserverEntry,
      ],
      observer as unknown as IntersectionObserver,
    ),
  );
}

function setPortfolio(p: typeof portfolio) {
  act(() => {
    usePortfolioStore.setState({ portfolio: p, assumptions, status: "ready" });
  });
}

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  setPortfolio(portfolio);
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "property",
      selectedPropertyId: owner.id,
      asOf: null,
      amortizationOpen: false,
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

const nav = () => screen.getByRole("navigation", { name: pd.sectionNavLabel });
const link = (name: string) => within(nav()).getByRole("link", { name });
const current = () =>
  within(nav())
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current") === "location")
    .map((a) => a.textContent);

describe("Property detail section nav (ADR 0107)", () => {
  it("links every section, in page order, to an element on the page", () => {
    render(<PropertyDetail />);
    const links = within(nav()).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      pd.sectionOverview,
      en.dataCheck.title,
      pd.sectionRecords,
      pd.sectionFinancing,
      pd.sectionAcquisition,
      pd.sectionHolding,
      pd.sectionProjection,
      pd.sectionAmortization,
    ]);
    const targets = links.map((a) =>
      document.getElementById(a.getAttribute("href")!.slice(1)),
    );
    targets.forEach((el) => expect(el).not.toBeNull());
    // Page order: each section follows the previous one in the document.
    for (let i = 1; i < targets.length; i++) {
      expect(
        targets[i - 1]!.compareDocumentPosition(targets[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("moves focus to the section heading and marks the link current", async () => {
    render(<PropertyDetail />);
    expect(current()).toEqual([pd.sectionOverview]);
    await userEvent.click(link(pd.sectionHolding));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: pd.holdingCostsTitle }),
    );
    expect(current()).toEqual([pd.sectionHolding]);
    await userEvent.click(link(pd.sectionOverview));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: pd.sectionOverview }),
    );
  });

  it("works from the keyboard", async () => {
    render(<PropertyDetail />);
    link(pd.sectionFinancing).focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: pd.mortgagesTitle }),
    );
  });

  it("marks the section the observer reports in view", () => {
    render(<PropertyDetail />);
    inView("pd-projection");
    expect(current()).toEqual([pd.sectionProjection]);
  });

  it("does not trip the leave guard: an open record form keeps its draft", async () => {
    render(<PropertyDetail />);
    const records = document.getElementById("pd-records")!;
    await userEvent.click(
      within(records).getAllByRole("button", { name: en.common.edit })[0]!,
    );
    const input =
      records.querySelector<HTMLInputElement>(".record-form input")!;
    await userEvent.clear(input);
    await userEvent.type(input, "1");
    expect(useUiStore.getState().unsavedChanges).toBe(true);
    await userEvent.click(link(pd.sectionHolding));
    expect(useUiStore.getState().pendingLeave).toBeNull();
    expect(useUiStore.getState().route).toBe("property");
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("1");
  });

  it("puts the loan warnings in the Financing section", () => {
    // A contract maturity far from the instalment-implied one raises a warning.
    setPortfolio({
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.id === loan.id
          ? { ...m, contractMaturityDate: isoDate("2030-01-01") }
          : m,
      ),
    });
    render(<PropertyDetail />);
    const financing = document.getElementById("pd-financing")!;
    // A status, not an alert: standing state (ADR 0157).
    expect(within(financing).getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("lists only the record sections when stored data is invalid", () => {
    setPortfolio({
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.id === loan.id ? { ...m, monthlyInstalment: money(1) } : m,
      ),
    });
    render(<PropertyDetail />);
    expect(
      within(nav())
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual([pd.sectionRecords, pd.sectionFinancing, pd.sectionHolding]);
  });
});

describe("Property detail amortization disclosure (ADR 0107)", () => {
  const amortization = () => document.getElementById("pd-amortization")!;
  const toggle = () =>
    within(amortization()).getByRole("button", { expanded: false });

  it("is collapsed on first open, with export still available", () => {
    render(<PropertyDetail />);
    expect(toggle().textContent).toMatch(/^Show amortization schedule \(\d+/);
    expect(within(amortization()).queryByRole("table")).toBeNull();
    expect(
      within(amortization()).getByRole("button", {
        name: en.xlsx.exportToExcel,
      }),
    ).toBeTruthy();
  });

  it("expands and collapses, and stays open for the session", async () => {
    const { unmount } = render(<PropertyDetail />);
    await userEvent.click(toggle());
    const hide = within(amortization()).getByRole("button", {
      name: pd.hideAmortization,
    });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    const table = within(amortization()).getByRole("table");
    expect(hide.getAttribute("aria-controls")).toBe(table.closest("[id]")!.id);
    unmount();
    render(<PropertyDetail />);
    expect(within(amortization()).getByRole("table")).toBeTruthy();
    await userEvent.click(
      within(amortization()).getByRole("button", { name: pd.hideAmortization }),
    );
    expect(within(amortization()).queryByRole("table")).toBeNull();
    expect(useUiStore.getState().amortizationOpen).toBe(false);
  });
});

describe("Property detail data check (ADR 0118)", () => {
  const dataCheck = () => document.getElementById("pd-dataCheck")!;
  const acquisitionToggle = () =>
    within(screen.getByRole("dialog")).getByRole("button", {
      name: en.propertyForm.acquisitionSection,
    });
  const withoutValuation = {
    ...portfolio,
    valuations: portfolio.valuations.filter((v) => v.propertyId !== owner.id),
  };

  beforeEach(() => {
    act(() =>
      useUiStore.setState({ asOf: assumptions.baseDate, propertyTarget: null }),
    );
  });

  it("lists the property's findings; a fix link moves to the section that fixes it", async () => {
    setPortfolio(withoutValuation);
    render(<PropertyDetail />);
    const section = within(dataCheck());
    expect(
      section.getByText(en.dataCheck.noValuation(fmtCzk(owner.purchasePrice))),
    ).toBeTruthy();
    expect(section.getByText(en.dataCheck.growthBoth)).toBeTruthy();
    await userEvent.click(
      section.getByRole("button", { name: "Go to Records" }),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: pd.valuationsTitle }),
    );
  });

  it("the growth finding opens the property form", async () => {
    render(<PropertyDetail />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(
      within(dataCheck()).getByRole("button", {
        name: en.properties.editProperty,
      }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(acquisitionToggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("the own-cash finding opens the property form at its Acquisition section (#178)", async () => {
    render(<PropertyDetail />);
    const section = within(dataCheck());
    expect(section.getByText(en.dataCheck.fundingUnknown)).toBeTruthy();
    await userEvent.click(
      section.getByRole("button", { name: en.dataCheck.recordFunding }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(acquisitionToggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("lands once on the section a Dashboard fix link asked for", () => {
    act(() => useUiStore.setState({ propertyTarget: "financing" }));
    render(<PropertyDetail />);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: pd.mortgagesTitle }),
    );
    expect(useUiStore.getState().propertyTarget).toBeNull();
  });

  it("waits for the portfolio before landing", () => {
    act(() => {
      usePortfolioStore.setState({ portfolio: null, status: "loading" });
      useUiStore.setState({ propertyTarget: "holding" });
    });
    render(<PropertyDetail />);
    expect(useUiStore.getState().propertyTarget).toBe("holding");
    setPortfolio(portfolio);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: pd.holdingCostsTitle }),
    );
    expect(useUiStore.getState().propertyTarget).toBeNull();
  });

  it("opens the property form when the Dashboard link asked for it", () => {
    act(() => useUiStore.setState({ propertyTarget: "edit" }));
    render(<PropertyDetail />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(acquisitionToggle().getAttribute("aria-expanded")).toBe("false");
    expect(useUiStore.getState().propertyTarget).toBeNull();
  });

  it("opens the form at its Acquisition section when the Dashboard link asked for it (#178)", () => {
    act(() => useUiStore.setState({ propertyTarget: "editFunding" }));
    render(<PropertyDetail />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(acquisitionToggle().getAttribute("aria-expanded")).toBe("true");
    expect(useUiStore.getState().propertyTarget).toBeNull();
  });
});

describe('A property stored with the id "" (ADR 0127)', () => {
  it("opens like any other property", () => {
    setPortfolio(withPropertyId(owner.id, ""));
    act(() => useUiStore.setState({ selectedPropertyId: "" }));
    render(<PropertyDetail />);
    expect(screen.queryByText(pd.noneSelectedTitle)).toBeNull();
    expect(nav()).toBeTruthy();
    expect(screen.getAllByText(owner.name).length).toBeGreaterThan(0);
  });
});
