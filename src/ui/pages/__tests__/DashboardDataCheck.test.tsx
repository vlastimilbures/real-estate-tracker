// @vitest-environment jsdom
//
// ADR 0118 (#35), ADR 0206 (#378), ADR 0223 (#422): the Dashboard "Data check" panel:
// last on the page, the counts as pills in its head, findings grouped by problem in a
// block per list, a chip per property.
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { edate, money, type Portfolio } from "../../../engine";
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
const lines = () => document.querySelectorAll(".dc-row");
const head = () =>
  screen
    .getByRole("heading", { level: 2, name: d.title })
    .closest(".panel") as HTMLElement;
const pills = () =>
  [...head().querySelectorAll(".dc-pill")].map((x) => x.textContent);
/** The text behind the panel's info icon (ADR 0217). */
const infoText = () => {
  const b = within(head()).getByRole("button", {
    name: `${en.common.aboutThis}: ${d.title}`,
  });
  return document.getElementById(b.getAttribute("aria-controls")!)?.textContent;
};
const chip = (name: RegExp) => screen.getByRole("button", { name });

describe("Data check panel (ADR 0118, ADR 0206)", () => {
  it("only defaults: collapsed, the counts in the head, the as-of date behind the info icon (ADR 0223 §1)", () => {
    renderPanel(portfolio);
    expect(screen.getByText(d.title)).toBeTruthy();
    expect(pills()).toEqual([d.attentionNone, d.useDefaults(6)]);
    expect(head().querySelector(".dc-pill.ok")).not.toBeNull();
    // Chips (ADR 0268): the ok count and the neutral one share the shape.
    expect(
      [...head().querySelectorAll(".dc-pill")].map((x) => x.className),
    ).toEqual(["chip dc-pill ok", "chip dc-pill"]);
    expect(infoText()).toBe("Checked as of 07.06.2026.");
    expect(document.querySelector(".dc-summary")).toBeNull();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(lines()).toHaveLength(0);
  });

  it("something needs attention: open, four lines instead of twelve sentences", () => {
    renderPanel(portfolio, fiveYears);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(pills()).toEqual([d.needAttention(6), d.useDefaults(6)]);
    expect(head().querySelector(".dc-pill.warn")).not.toBeNull();
    // The warn count is the title pill's warn chip (ADR 0268).
    expect(
      [...head().querySelectorAll(".dc-pill")].map((x) => x.className),
    ).toEqual(["chip dc-pill warn", "chip dc-pill"]);
    // A block per list, each a heading over the list it names (ADR 0223 §2).
    expect(
      [...document.querySelectorAll(".dc-block")].map((b) => [
        b.className,
        b.querySelector("h3")?.textContent,
      ]),
    ).toEqual([
      ["dc-block attention", d.attentionTitle],
      ["dc-block defaults", d.defaultsTitle],
    ]);
    // Each row: its icon, the problem, the chips on the right.
    for (const row of lines()) {
      expect(row.querySelector(".dc-icon")).not.toBeNull();
      expect(row.querySelector(".dc-row-actions .dc-chip")).not.toBeNull();
    }
    expect(
      [...lines()].map((l) => l.querySelector(".dc-problem")?.textContent),
    ).toEqual([
      d.valuationStaleGroup("12", 12),
      d.fixationEndedGroup(fmtPct(assumptions.postFixationResetRatePa)),
      d.growthBoth,
      d.fundingUnknown,
    ]);
    expect(document.querySelectorAll(".dc-chip")).toHaveLength(12);
    for (const c of document.querySelectorAll(".dc-chip"))
      expect(c.className).toBe("chip dc-chip");
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

  it("the head's counts read as two phrases", () => {
    renderPanel(portfolio, fiveYears);
    expect(head().querySelector(".dc-pills")?.textContent).toBe(
      `${d.needAttention(6)} · ${d.useDefaults(6)}`,
    );
  });

  it("a manual Show / Hide wins for the session; the counts stay", async () => {
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
    expect(pills()).toContain(d.useDefaults(6));
    // Shown, not inside the hidden body.
    expect(head().querySelector(".dc-pill")!.closest("[hidden]")).toBeNull();
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
    // Only the as-of info icon: no toggle, no chips (ADR 0223 §4).
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual([`${en.common.aboutThis}: ${d.title}`]);
    expect(lines()).toHaveLength(0);
    expect(document.querySelector(".dc-clear")?.textContent).toBe(
      d.attentionNone,
    );
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
      status: { kind: "ready" },
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
    expect(infoText()).toBe("Checked as of 07.06.2031.");
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

describe("Data check: all clear (ADR 0223 §4)", () => {
  it("is the title and one quiet line with a check: no pills, no toggle, no blocks", () => {
    render(
      <DataCheckPanel
        check={{ attention: [], defaults: [] }}
        asOf={BASE_DATE}
        resetRate={assumptions.postFixationResetRatePa}
        onFix={() => undefined}
      />,
    );
    expect(head().querySelector(".dc-pill")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^(show|hide) data check$/i }),
    ).toBeNull();
    expect(document.querySelector(".dc-block")).toBeNull();
    const line = document.querySelector(".dc-clear")!;
    expect(line.textContent).toBe(d.attentionNone);
    expect(line.querySelector("svg")).not.toBeNull();
  });
});
