// @vitest-environment jsdom
//
// ADR 0223 (#422): Property detail's Data check takes the Dashboard's look — the counts
// as pills in the head, the as-of note behind the info icon, a block per list of
// hairline rows with the fix on the right — and is the page's last section, with the
// title pill when something needs attention. ADR 0118 #133: each fix button is
// described by its own row, in both blocks.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { edate } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { dataCheckItems } from "../../model/dataCheck";
import { PropertyDataCheckPanel } from "../PropertyDataCheck";
import { PropertyDetail } from "../PropertyDetail";
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

const d = en.dataCheck;
const p = portfolio.properties[0]!;
const fiveYears = edate(BASE_DATE, 60);

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

function panel(
  asOf: Date,
  check = dataCheckItems([p], portfolio, asOf, BASE_DATE),
) {
  const onFix = vi.fn();
  const view = render(
    <PropertyDataCheckPanel
      check={check}
      asOf={asOf}
      resetRate={assumptions.postFixationResetRatePa}
      onFix={onFix}
    />,
  );
  // The head and the counts' line under it.
  const head = view.container.querySelector(".panel") as HTMLElement;
  return { ...view, onFix, check, head };
}

describe("Property detail Data check (ADR 0223 §1–§4)", () => {
  it("the head holds the counts as pills and the as-of note behind the info icon", () => {
    const { head, check } = panel(fiveYears);
    expect(check.attention.length).toBeGreaterThan(0);
    expect(check.defaults.length).toBeGreaterThan(0);
    const pills = [...head.querySelectorAll(".dc-pill")].map(
      (x) => x.textContent,
    );
    expect(pills).toEqual([
      d.needAttention(check.attention.length),
      d.useDefaults(check.defaults.length),
    ]);
    expect(head.querySelector(".dc-pill.warn")).not.toBeNull();
    const info = within(head).getByRole("button", {
      name: `${en.common.aboutThis}: ${d.title}`,
    });
    expect(
      document.getElementById(info.getAttribute("aria-controls")!)?.textContent,
    ).toBe(d.asOfNote("07.06.2031"));
    // The old count sentence and bottom note are gone.
    expect(document.querySelector(".panel-note")).toBeNull();
  });

  it("two blocks, each a heading over the list it names, rows with the fix on the right", () => {
    const { check } = panel(fiveYears);
    const blocks = [...document.querySelectorAll<HTMLElement>(".dc-block")];
    expect(blocks.map((b) => b.querySelector("h3")?.textContent)).toEqual([
      d.attentionTitle,
      d.defaultsTitle,
    ]);
    expect(blocks[0]!.classList.contains("attention")).toBe(true);
    const attention = screen.getByRole("list", { name: d.attentionTitle });
    expect(within(attention).getAllByRole("listitem")).toHaveLength(
      check.attention.length,
    );
    expect(screen.getByRole("list", { name: d.defaultsTitle })).toBeTruthy();
    for (const row of document.querySelectorAll(".dc-row")) {
      expect(row.querySelector(".dc-icon")).not.toBeNull();
      expect(row.querySelector(".dc-problem")).not.toBeNull();
      expect(row.querySelector(".dc-row-actions button")).not.toBeNull();
    }
  });

  it("each fix button is described by its own row, in both blocks (#133), and opens its fix", async () => {
    const { check, onFix } = panel(fiveYears);
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(".dc-row-actions button"),
    ];
    expect(buttons).toHaveLength(
      check.attention.length + check.defaults.length,
    );
    const ids = buttons.map((b) => b.getAttribute("aria-describedby") ?? "");
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of buttons)
      expect(
        b
          .closest("li")
          ?.contains(
            document.getElementById(b.getAttribute("aria-describedby")!),
          ),
      ).toBe(true);
    await userEvent.click(buttons[0]!);
    expect(onFix).toHaveBeenCalledTimes(1);
  });

  it("all clear: one quiet line with a check, no pills and no blocks", () => {
    const { head } = panel(BASE_DATE, { attention: [], defaults: [] });
    expect(head.querySelector(".dc-pill")).toBeNull();
    expect(document.querySelector(".dc-block")).toBeNull();
    expect(document.querySelector(".dc-clear")?.textContent).toBe(
      d.attentionNone,
    );
  });
});

describe("Property detail page (ADR 0223 §5)", () => {
  it("the Data check is the last section", () => {
    act(() => useUiStore.setState({ asOf: fiveYears }));
    const { container } = render(<PropertyDetail />);
    const sections = [...container.querySelectorAll(".pd-section")].map(
      (s) => s.id,
    );
    expect(sections.at(-1)).toBe("pd-dataCheck");
    const links = [...container.querySelectorAll(".section-nav a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links.at(-1)).toBe("#pd-dataCheck");
  });

  it("the title pill counts what needs attention and moves focus to the Data check", async () => {
    act(() => useUiStore.setState({ asOf: fiveYears }));
    render(<PropertyDetail />);
    const n = dataCheckItems([p], portfolio, fiveYears, BASE_DATE).attention
      .length;
    const pill = screen.getByRole("button", { name: d.reviewPill(n) });
    expect(pill.closest(".topbar")).not.toBeNull();
    expect(pill.textContent).toBe(String(n));
    await userEvent.click(pill);
    expect(document.activeElement?.textContent).toBe(d.title);
  });

  it("no pill when nothing needs attention", () => {
    render(<PropertyDetail />);
    const n = dataCheckItems(
      [p],
      portfolio,
      new Date(Date.UTC(2026, 9, 1)),
      BASE_DATE,
    ).attention.length;
    expect(n).toBe(0);
    expect(document.querySelector(".title-pill")).toBeNull();
  });
});
