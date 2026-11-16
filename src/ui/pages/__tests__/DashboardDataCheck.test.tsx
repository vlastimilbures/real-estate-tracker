// @vitest-environment jsdom
//
// ADR 0118 (#35), ADR 0206 (#378): the Dashboard "Data check" panel: last on the page, a
// summary row first, findings grouped by problem with a chip per property.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { edate, isoDate, money, type Portfolio } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { fmtPct } from "../../../lib/format";
import { DataCheckPanel } from "../DashboardDataCheck";
import { Dashboard } from "../Dashboard";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { dashboardDataCheck } from "../../model/dataCheck";

const d = en.dataCheck;
const fiveYears = edate(BASE_DATE, 60); // 07.06.2031
const months = en.propertyDetail.monthsCount(60);

function renderPanel(
  p: Portfolio,
  asOf: Date = BASE_DATE,
  { baseDate = BASE_DATE, horizonYears = assumptions.horizonYears } = {},
) {
  const onFix = vi.fn();
  render(
    <DataCheckPanel
      check={dashboardDataCheck(p, asOf, baseDate, horizonYears)}
      asOf={asOf}
      resetRate={assumptions.postFixationResetRatePa}
      onFix={onFix}
    />,
  );
  return { onFix };
}

// The panel's Show/Hide toggle (the title's pill also names the Data check).
const toggle = () =>
  screen.getByRole("button", { name: /^(show|hide) data check$/i });
const lines = () => document.querySelectorAll(".dc-line");
const chip = (name: RegExp) => screen.getByRole("button", { name });

beforeEach(() =>
  act(() => useUiStore.setState({ language: "en", dataCheckOpen: null })),
);

describe("Data check panel (ADR 0118, ADR 0206)", () => {
  it("only defaults: collapsed to its summary row, with the as-of date", () => {
    renderPanel(portfolio);
    expect(screen.getByText(d.title)).toBeTruthy();
    expect(screen.getByText(d.attentionNone)).toBeTruthy();
    expect(screen.getByText(d.useDefaults(6))).toBeTruthy();
    expect(screen.getByText("Checked as of 07.06.2026.")).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(lines()).toHaveLength(0);
  });

  it("something needs attention: open, four lines instead of twelve sentences", () => {
    renderPanel(portfolio, fiveYears);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(d.needAttention(6))).toBeTruthy();
    expect(screen.getByText(d.useDefaults(6))).toBeTruthy();
    expect(
      [...lines()].map((l) => l.querySelector(".dc-problem")?.textContent),
    ).toEqual([
      d.valuationStaleGroup,
      d.fixationEndedGroup(fmtPct(assumptions.postFixationResetRatePa)),
      d.growthBoth,
      d.fundingUnknown,
    ]);
    expect(document.querySelectorAll(".dc-chip")).toHaveLength(12);
    // The lists keep their names for assistive technology.
    expect(screen.getByRole("list", { name: d.attentionTitle })).toBeTruthy();
    expect(screen.getByRole("list", { name: d.defaultsTitle })).toBeTruthy();
  });

  it("each chip is named by its property, detail and problem, and opens its fix", async () => {
    const { onFix } = renderPanel(portfolio, fiveYears);
    const stale = chip(
      /^Byt Lipova · 60 months · 01\.06\.2026 The valuation in use/,
    );
    expect(stale.textContent).toBe(`Byt Lipova · ${months} · 01.06.2026`);
    // The destination is the description and the tooltip.
    const desc = document.getElementById(
      stale.getAttribute("aria-describedby") ?? "",
    );
    expect(desc?.textContent).toBe("Go to Records");
    expect(stale.getAttribute("title")).toBe("Go to Records");
    await userEvent.click(stale);
    expect(onFix).toHaveBeenCalledWith("lipova", "records");
    await userEvent.click(
      chip(/^Byt Dubova · 12\.03\.2031 The fixation ended/),
    );
    expect(onFix).toHaveBeenLastCalledWith("dubova", "financing");
    await userEvent.click(
      chip(/^Byt Javorova Uses the portfolio appreciation/),
    );
    expect(onFix).toHaveBeenLastCalledWith("javorova", "edit");
    await userEvent.click(chip(/^Byt Lipova Own cash paid at purchase/));
    expect(onFix).toHaveBeenLastCalledWith("lipova", "editFunding");
  });

  it("every chip's own ids are unique across both lists and resolve in its line (#133)", () => {
    renderPanel(portfolio, fiveYears);
    const chips = [...document.querySelectorAll<HTMLElement>(".dc-chip")];
    const refs = (c: HTMLElement) =>
      [
        ...(c.getAttribute("aria-labelledby") ?? "").split(" "),
        c.getAttribute("aria-describedby") ?? "",
      ].filter(Boolean);
    // The chip text and its destination belong to one chip; the problem line is shared.
    const own = chips.flatMap((c) => refs(c).filter((_, i) => i !== 1));
    expect(new Set(own).size).toBe(own.length);
    for (const c of chips)
      for (const id of refs(c))
        expect(c.closest("li")?.contains(document.getElementById(id))).toBe(
          true,
        );
  });

  it("the summary reads as two phrases", () => {
    renderPanel(portfolio, fiveYears);
    expect(document.querySelector(".dc-summary")?.textContent).toBe(
      `${d.needAttention(6)} · ${d.useDefaults(6)}`,
    );
  });

  it("a manual Show / Hide wins for the session; the summary stays", async () => {
    renderPanel(portfolio);
    await userEvent.click(toggle());
    expect(useUiStore.getState().dataCheckOpen).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(lines()).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /Uses the portfolio/ }),
    ).toHaveLength(3);
    await userEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText(d.useDefaults(6))).toBeTruthy();
  });

  it("leaves out inactive properties, as the Dashboard's totals do", () => {
    renderPanel(
      {
        ...portfolio,
        properties: portfolio.properties.map((p) =>
          p.id === "dubova" ? { ...p, active: false } : p,
        ),
      },
      fiveYears,
    );
    expect(screen.getByText(d.needAttention(4))).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Byt Dubova/ })).toBeNull();
  });

  it("no finding: one summary row, no toggle", () => {
    const own: Portfolio = {
      ...portfolio,
      properties: portfolio.properties.map((p) => ({
        ...p,
        appreciationOverridePa: assumptions.appreciationPa,
        rentIndexOverridePa: assumptions.rentIndexationPa,
        funding: { ownCash: money("2000000") },
      })),
    };
    renderPanel(own);
    expect(screen.queryByRole("button")).toBeNull();
    expect(lines()).toHaveLength(0);
    expect(screen.getByText(d.attentionNone)).toBeTruthy();
    expect(screen.queryByText(d.useDefaults(0))).toBeNull();
  });
});

function showDashboard(
  ids: string[],
  asOf: Date,
  a: typeof assumptions = assumptions,
) {
  act(() => {
    usePortfolioStore.setState({
      status: "ready",
      portfolio,
      assumptions: a,
      scenarios: [],
      sample: { active: false, dismissed: true },
    });
    useUiStore.setState({
      route: "dashboard",
      dashboardPropertyIds: ids,
      asOf,
      propertyTarget: null,
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    });
  });
  return render(<Dashboard />);
}

describe("Data check on the Dashboard page (ADR 0118, ADR 0206)", () => {
  it("checks the filtered properties at the snapshot date; a chip opens the property there", async () => {
    showDashboard(["lipova"], fiveYears);
    expect(screen.getByText(d.needAttention(2))).toBeTruthy();
    expect(screen.getByText("Checked as of 07.06.2031.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^Byt Javorova ·/ }),
    ).toBeNull();
    await userEvent.click(chip(/^Byt Lipova · 15\.01\.2029/));
    const ui = useUiStore.getState();
    expect([ui.route, ui.selectedPropertyId, ui.propertyTarget]).toEqual([
      "property",
      "lipova",
      "financing",
    ]);
  });

  it("is the last section of the page (ADR 0206 §1)", () => {
    const { container } = showDashboard([], fiveYears);
    const panels = [...container.querySelectorAll("section.panel h2")].map(
      (h) => h.textContent,
    );
    expect(panels.at(-1)).toBe(d.title);
  });

  it("the title's pill opens the Data check and moves focus to its heading (ADR 0218 §1)", async () => {
    act(() => useUiStore.setState({ dataCheckOpen: false }));
    showDashboard([], fiveYears);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    const pill = screen.getByRole("button", { name: d.reviewPill(6) });
    // Beside the page title, not in the filter bar.
    expect(pill.closest(".topbar")).not.toBeNull();
    expect(pill.closest(".filter-bar")).toBeNull();
    expect(pill.getAttribute("title")).toBe(d.reviewPill(6));
    expect(pill.textContent).toBe("6");
    expect(document.querySelector(".filter-bar .asof-foot .btn")).toBeNull();
    await userEvent.click(pill);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe(d.title);
    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("has no link when nothing needs attention, whatever the defaults", () => {
    showDashboard([], BASE_DATE);
    expect(screen.queryByRole("button", { name: /to review/ })).toBeNull();
    expect(document.querySelector(".title-pill")).toBeNull();
  });
});

describe("Data check on the Dashboard: the projection horizon (ADR 0148)", () => {
  it("lists a stored horizon outside the form range first; its chip opens Assumptions (#133)", async () => {
    showDashboard([], BASE_DATE, { ...assumptions, horizonYears: 150 });
    const [first] = lines();
    expect(first.querySelector(".dc-problem")?.textContent).toBe(
      "The projection horizon of 150 years is outside the range the forms accept (1–100 years).",
    );
    await userEvent.click(
      within(first as HTMLElement).getByRole("button", {
        name: /^Go to Assumptions/,
      }),
    );
    const ui = useUiStore.getState();
    expect([ui.route, ui.settingsTab]).toEqual(["settings", "assumptions"]);
  });
});

// ADR 0149 §5: stored dates before 1900 under "Needs attention", with their fix.
describe("Data check on the Dashboard: dates before 1900 (ADR 0149)", () => {
  it("lists a property's early date on its own line; the chip opens its record", async () => {
    const legacy: Portfolio = {
      ...portfolio,
      leases: portfolio.leases.map((l) =>
        l.propertyId === "dubova"
          ? { ...l, startDate: isoDate("1025-07-01") }
          : l,
      ),
    };
    const { onFix } = renderPanel(legacy);
    const line = screen
      .getByText(
        "A lease date 01.07.1025 is before 01.01.1900, the earliest date the forms accept. Check the year for a typo.",
      )
      .closest(".dc-line") as HTMLElement;
    await userEvent.click(
      within(line).getByRole("button", { name: /^Byt Dubova/ }),
    );
    expect(onFix).toHaveBeenCalledWith("dubova", "records");
  });

  it("lists an early base date as a portfolio line first; its chip opens Assumptions", async () => {
    const { onFix } = renderPanel(portfolio, BASE_DATE, {
      baseDate: isoDate("1826-06-07"),
    });
    const [first] = lines();
    expect(first.querySelector(".dc-problem")?.textContent).toBe(
      "The base date 07.06.1826 is before 01.01.1900, the earliest date the forms accept. Check the year for a typo.",
    );
    await userEvent.click(
      within(first as HTMLElement).getByRole("button", {
        name: /^Go to Assumptions/,
      }),
    );
    expect(onFix).toHaveBeenCalledWith(null, "assumptions");
  });
});
