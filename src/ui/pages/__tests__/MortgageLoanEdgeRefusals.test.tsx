// @vitest-environment jsdom
//
// ADR 0226: the mortgage form shows the two new refusals where they belong: a tranche in
// the loan's last two payment months on its tranche row, a mortgage starting within a
// month of another under Start date. The save is checked like the store does it.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MortgagesPanel } from "../PropertyEntityPanels";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import {
  isoDate,
  validatePortfolio,
  type MortgageBlock,
} from "../../../engine";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { dubovaDevLoan } from "../../../engine/__tests__/support/loan";

const en = getDict("en");
const d = en.propertyDetail;
const plain = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;
// From 2024-03-12 over 30 years: payment 358 is due 2054-01-12, 359 2054-02-12.
const dev = dubovaDevLoan();

/** A later Dubova block, stored next to the edited one. */
const later: MortgageBlock = {
  ...plain,
  id: "m-later",
  startDate: isoDate("2031-03-12"),
};
const stored = { ...portfolio, mortgages: [...portfolio.mortgages, later] };

/** Saves like the store: the edit is checked against the engine rules first. */
const save = vi.fn(async (m: MortgageBlock) => {
  const errors = validatePortfolio({
    ...stored,
    mortgages: stored.mortgages.map((x) => (x.id === m.id ? m : x)),
  }).filter((e) => e.id === m.id);
  return errors.length
    ? { ok: false as const, error: { kind: "input" as const, errors } }
    : { ok: true as const };
});

beforeEach(() => {
  save.mockClear();
  act(() => {
    useUiStore.setState({ route: "property" });
    usePortfolioStore.setState({ saveMortgageBlock: save });
  });
});

async function openEdit(block: MortgageBlock) {
  render(<MortgagesPanel propertyId="dubova" rows={[block]} />);
  await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
}

const schedule = () => screen.getByRole("group", { name: d.fieldDraws });
const tranche = (n: number) =>
  within(schedule()).getByRole("group", { name: d.trancheRow(n) });
const addTranche = () =>
  within(schedule()).getByRole("button", { name: d.addTranche });
const cell = (row: HTMLElement, label: string) =>
  within(row).getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
const saveButton = () =>
  screen.getByRole("button", { name: en.common.saveChanges });

describe("the mortgage form shows the ADR 0226 refusals", () => {
  it("a tranche in the last two payment months, on its row", async () => {
    await openEdit(dev);
    await userEvent.click(addTranche());
    await userEvent.type(cell(tranche(2), d.eventDate), "01.02.2054");
    await userEvent.type(cell(tranche(2), d.eventAmount), "100000");
    await userEvent.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(tranche(2).textContent).toContain(
      en.inputRules.DRAW_IN_LAST_TWO_PAYMENTS,
    );
    expect(tranche(1).textContent).not.toContain(
      en.inputRules.DRAW_IN_LAST_TWO_PAYMENTS,
    );
  });

  it("a start within a month of another mortgage, under Start date", async () => {
    await openEdit(plain);
    const start = screen.getByLabelText(
      new RegExp(`^${d.fieldStartDate}`),
    ) as HTMLInputElement;
    await userEvent.clear(start);
    await userEvent.type(start, "20.02.2031");
    await userEvent.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(start.getAttribute("aria-invalid")).toBe("true");
    const described = (start.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(described).toContain(en.inputRules.REFINANCE_WITHIN_A_MONTH);
  });
});
