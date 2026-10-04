// @vitest-environment jsdom
//
// ADR 0119 §4, §9 (#33 PR3): Property detail's Acquisition section, after Financing. An
// unknown part reads "—", no acquisition loan reads "None", and a sources & uses gap is a
// standing warning note, never a blocker.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, within } from "@testing-library/react";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { money, type Property } from "../../../engine";
import { fmtCzk } from "../../../lib/format";

vi.mock("../../../data/errorLog", () => ({ logFailure: vi.fn() }));

const pd = en.propertyDetail;

class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function show(id: string, funding?: Property["funding"], p = portfolio) {
  act(() => {
    usePortfolioStore.setState({
      portfolio: {
        ...p,
        properties: p.properties.map((x) =>
          x.id === id ? { ...x, funding } : x,
        ),
      },
      assumptions,
      status: "ready",
    });
    useUiStore.setState({ selectedPropertyId: id });
  });
  render(<PropertyDetail />);
}

const section = () => document.getElementById("pd-acquisition");
/** Each row's label → shown value. */
const rows = () => {
  const keys = section()!.querySelectorAll(".statlist .k");
  return Object.fromEntries(
    [...keys].map((k) => [k.textContent, k.nextElementSibling?.textContent]),
  );
};

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoObserver);
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "property",
      asOf: null,
      amortizationOpen: false,
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Property detail Acquisition section (ADR 0119 §9)", () => {
  it("follows Financing; an unknown part reads — and no acquisition loan reads None", () => {
    // Javorova's first block starts years after its purchase: no acquisition loan.
    show("javorova");
    expect(
      document.getElementById("pd-financing")!.nextElementSibling?.id,
    ).toBe("pd-acquisition");
    expect(
      within(section()!).getByRole("heading", { name: pd.acqTitle }),
    ).toBeTruthy();
    expect(rows()).toEqual({
      [pd.acqPrice]: fmtCzk(4_080_000),
      [pd.acqTransactionCosts]: "—",
      [pd.acqInitialWorks]: "—",
      [pd.acqUses]: fmtCzk(4_080_000),
      [pd.acqCashInvested]: "—",
      [pd.acqLoan]: pd.acqLoanNone,
      [pd.acqSources]: "—",
    });
    expect(within(section()!).queryByRole("note")).toBeNull();
  });

  it("warns, as a note, when the recorded sources fall short of the uses", () => {
    show("lipova", {
      ownCash: money("1600000"),
      transactionCosts: money("10000"),
    });
    expect(rows()[pd.acqLoan]).toBe(fmtCzk(5_610_000));
    expect(rows()[pd.acqSources]).toBe(fmtCzk(7_210_000));
    expect(within(section()!).getByRole("note").textContent).toBe(
      pd.acqGapShort(fmtCzk(25_000)),
    );
    expect(within(section()!).queryByRole("alert")).toBeNull();
  });

  it("says so in other words when the sources exceed the uses", () => {
    show("lipova", { ownCash: money("1700000") });
    expect(within(section()!).getByRole("note").textContent).toBe(
      pd.acqGapOver(fmtCzk(85_000)),
    );
  });

  it("shows no warning when the recorded sources match the uses", () => {
    show("lipova", { ownCash: money("1615000") });
    expect(within(section()!).queryByRole("note")).toBeNull();
  });

  it("shows the recorded funding note with its line breaks", () => {
    show("dubova", { note: "Bought with savings\nand a family loan" });
    const note = within(section()!).getByText(
      pd.acqRecordedNote("Bought with savings\nand a family loan"),
      { normalizer: (s) => s },
    );
    expect(note.className).toContain("funding-note");
  });

  it("is not shown while the stored data breaks an engine rule", () => {
    show("lipova", undefined, {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.propertyId === "lipova" ? { ...m, monthlyInstalment: money(1) } : m,
      ),
    });
    // The record sections stay, so the data can be fixed (DR-146).
    expect(document.getElementById("pd-financing")).not.toBeNull();
    expect(section()).toBeNull();
  });
});
