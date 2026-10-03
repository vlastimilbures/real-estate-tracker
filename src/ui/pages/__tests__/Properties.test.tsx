// @vitest-environment jsdom
//
// Properties table: the delete confirmation sits outside the scrolling table so it is
// never clipped, and the actions column stays pinned (UX-019).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Properties } from "../Properties";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

vi.mock("../../../lib/today", () => ({
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
}));

const en = getDict("en");
const first = portfolio.properties[0]!;

beforeEach(() =>
  act(() => {
    usePortfolioStore.setState({ portfolio, assumptions, status: "ready" });
    useUiStore.setState({ language: "en", route: "properties" });
  }),
);

describe("Properties delete confirmation (UX-019)", () => {
  it("shows below the table, outside the scrolling area", async () => {
    render(<Properties />);
    const deletes = screen.getAllByRole("button", { name: en.common.delete });
    await userEvent.click(deletes[0]!);
    const msg = screen.getByText(en.properties.confirmDelete(first.name));
    expect(msg.closest(".table-wrap")).toBeNull();
    expect(msg.closest("table")).toBeNull();
  });

  it("Cancel closes it without deleting", async () => {
    const removeProperty = vi.fn();
    act(() => usePortfolioStore.setState({ removeProperty }));
    render(<Properties />);
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
    render(<Properties />);
    await userEvent.click(
      screen.getAllByRole("button", { name: en.common.delete })[0]!,
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(removeProperty).toHaveBeenCalledWith(first.id);
  });

  it("pins the actions column", () => {
    render(<Properties />);
    const cell = screen
      .getAllByRole("button", { name: en.common.delete })[0]!
      .closest("td")!;
    expect(cell.className).toContain("actions-col");
  });
});

describe("Properties keyboard drill-in (UX-022)", () => {
  it("the property name is a button that opens the property", async () => {
    render(<Properties />);
    const name = screen.getByRole("button", { name: first.name });
    name.focus();
    await userEvent.keyboard("{Enter}");
    expect(useUiStore.getState().route).toBe("property");
    expect(useUiStore.getState().selectedPropertyId).toBe(first.id);
  });

  it("Space on the name opens it too", async () => {
    render(<Properties />);
    screen.getByRole("button", { name: first.name }).focus();
    await userEvent.keyboard(" ");
    expect(useUiStore.getState().selectedPropertyId).toBe(first.id);
  });
});

describe("Properties long names and narrow windows (ADR 0085)", () => {
  it("truncates the name but keeps the full name on hover and for screen readers", () => {
    render(<Properties />);
    const name = screen.getByRole("button", { name: first.name });
    expect(name.className).toContain("cell-name");
    expect(name.getAttribute("title")).toBe(first.name);
  });

  it("puts the risk and cash-flow columns right after the name", () => {
    render(<Properties />);
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
      "",
    ]);
  });

  it("row actions keep their labels for screen readers when shown as icons", () => {
    render(<Properties />);
    for (const label of [en.common.edit, en.common.delete]) {
      const button = screen.getAllByRole("button", { name: label })[0]!;
      expect(button.querySelector(".btn-label")?.textContent).toBe(label);
    }
  });
});

describe("Properties context line (ADR 0111, #21)", () => {
  it("names the as-of date, the currency and the flow period", () => {
    render(<Properties />);
    expect(
      screen.getByText(
        `${en.properties.subtitle(portfolio.properties.length)} · as of 01.10.2026 · amounts in Kč, flows per year`,
      ),
    ).toBeTruthy();
  });
});
