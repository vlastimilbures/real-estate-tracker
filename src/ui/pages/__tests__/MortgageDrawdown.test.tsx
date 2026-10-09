// @vitest-environment jsdom
//
// ADR 0167: a development loan's drawdown schedule. The start draw (the initial principal)
// is the fixed first row, the tranches are rows with add/remove, a footer totals the loan,
// an engine error shows on its own row, and soft warnings never block the save.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MortgagesPanel } from "../PropertyEntityPanels";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { fmtCzk } from "../../../lib/format";
import {
  isoDate,
  money,
  validatePortfolio,
  type MortgageBlock,
} from "../../../engine";
import { portfolio } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const d = en.propertyDetail;
const plain = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;
const dev: MortgageBlock = {
  ...plain,
  loanTermYears: 30,
  draws: [{ date: isoDate("2024-09-01"), amount: money("500000") }],
  completionDate: isoDate("2025-03-31"),
};

/** Saves like the store: the edit is checked against the engine rules first. */
const save = vi.fn(async (m: MortgageBlock) => {
  const errors = validatePortfolio({
    ...portfolio,
    mortgages: portfolio.mortgages.map((x) => (x.id === m.id ? m : x)),
  }).filter((e) => e.id === m.id);
  return errors.length
    ? { ok: false as const, error: { kind: "input" as const, errors } }
    : { ok: true as const };
});

beforeEach(() => {
  save.mockClear();
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "property",
      unsavedSources: [],
      unsavedChanges: false,
    });
    usePortfolioStore.setState({ saveMortgageBlock: save });
  });
});

async function openEdit(block: MortgageBlock) {
  render(<MortgagesPanel propertyId="dubova" rows={[block]} />);
  await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
}

const schedule = () => screen.getByRole("group", { name: d.fieldDraws });
const startRow = () =>
  within(schedule()).getByRole("group", { name: d.drawnAtStart });
const tranche = (n: number) =>
  within(schedule()).getByRole("group", { name: d.trancheRow(n) });
const addTranche = () =>
  within(schedule()).getByRole("button", { name: d.addTranche });
const removeTranche = (n: number) =>
  within(tranche(n)).getByRole("button", {
    name: d.eventRemove(d.trancheRow(n)),
  });
const cell = (row: HTMLElement, label: string) =>
  within(row).getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
const saveButton = () =>
  screen.getByRole("button", { name: en.common.saveChanges });
const saved = () => save.mock.calls.at(-1)![0];

describe("drawdown schedule (ADR 0167)", () => {
  it("opens a development block with the start draw first and the tranches below", async () => {
    await openEdit(dev);
    expect(startRow().textContent).toContain("12.03.2024");
    expect(cell(startRow(), d.eventAmount).value).toBe("3034500");
    // The initial principal moved into the schedule: no second copy in the grid.
    expect(
      screen.queryByLabelText(new RegExp(`^${d.fieldInitialPrincipal}`)),
    ).toBeNull();
    expect(cell(tranche(1), d.eventDate).value).toBe("01.09.2024");
    expect(cell(tranche(1), d.eventAmount).value).toBe("500000");
    expect(schedule().textContent).toContain(
      d.drawdownTotal(fmtCzk(money("3534500")), 1),
    );
  });

  it("saves the block unchanged when nothing is edited", async () => {
    await openEdit(dev);
    await userEvent.click(saveButton());
    expect(saved().initialPrincipal).toEqual(dev.initialPrincipal);
    expect(saved().draws).toEqual(dev.draws);
    expect(saved().completionDate).toEqual(dev.completionDate);
  });

  it("adds a tranche, focuses its date, updates the total and saves in row order", async () => {
    await openEdit(dev);
    await userEvent.click(addTranche());
    expect(document.activeElement).toBe(cell(tranche(2), d.eventDate));
    await userEvent.type(cell(tranche(2), d.eventDate), "01.02.2025");
    await userEvent.type(cell(tranche(2), d.eventAmount), "250000");
    expect(schedule().textContent).toContain(
      d.drawdownTotal(fmtCzk(money("3784500")), 2),
    );
    await userEvent.click(saveButton());
    expect(saved().draws).toEqual([
      { date: isoDate("2024-09-01"), amount: money("500000") },
      { date: isoDate("2025-02-01"), amount: money("250000") },
    ]);
  });

  it("editing the start draw changes the saved initial principal", async () => {
    await openEdit(dev);
    await userEvent.clear(cell(startRow(), d.eventAmount));
    await userEvent.type(cell(startRow(), d.eventAmount), "3000000");
    await userEvent.click(saveButton());
    expect(saved().initialPrincipal).toEqual(money("3000000"));
  });

  it("remove moves focus to the next row, or to Add when none is left", async () => {
    await openEdit({
      ...dev,
      draws: [
        { date: isoDate("2024-09-01"), amount: money("500000") },
        { date: isoDate("2025-01-01"), amount: money("100000") },
      ],
    });
    await userEvent.click(removeTranche(1));
    expect(document.activeElement).toBe(cell(tranche(1), d.eventDate));
    expect(cell(tranche(1), d.eventDate).value).toBe("01.01.2025");
    await userEvent.click(removeTranche(1));
    expect(document.activeElement).toBe(addTranche());
    await userEvent.click(saveButton());
    expect(saved().draws).toBeUndefined();
    // The completion date alone keeps it a development loan.
    expect(saved().completionDate).toEqual(dev.completionDate);
  });

  it("shows an engine error on the tranche it is about", async () => {
    await openEdit({
      ...dev,
      draws: [
        { date: isoDate("2024-09-01"), amount: money("500000") },
        { date: isoDate("2024-12-01"), amount: money("100000") },
      ],
    });
    const date = cell(tranche(2), d.eventDate);
    await userEvent.clear(date);
    await userEvent.type(date, "01.01.2024");
    await userEvent.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(tranche(2).textContent).toContain(en.inputRules.DRAW_BEFORE_START);
    expect(tranche(2).getAttribute("aria-describedby")).toBeTruthy();
    expect(tranche(1).textContent).not.toContain(
      en.inputRules.DRAW_BEFORE_START,
    );
  });

  it("marks a tranche that does not parse and does not save", async () => {
    await openEdit(dev);
    await userEvent.click(addTranche());
    await userEvent.type(cell(tranche(2), d.eventDate), "01.02.2025");
    await userEvent.type(cell(tranche(2), d.eventAmount), "0");
    await userEvent.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    expect(
      within(schedule()).getByText(en.forms.invalidHint.draws),
    ).toBeTruthy();
    expect(cell(tranche(2), d.eventAmount).getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("warns about a tranche after the interest-only end and a shared date, and still saves", async () => {
    await openEdit(dev);
    await userEvent.click(addTranche());
    await userEvent.type(cell(tranche(2), d.eventDate), "01.06.2025");
    await userEvent.type(cell(tranche(2), d.eventAmount), "100000");
    await userEvent.click(addTranche());
    await userEvent.type(cell(tranche(3), d.eventDate), "01.09.2024");
    await userEvent.type(cell(tranche(3), d.eventAmount), "100000");
    expect(tranche(2).textContent).toContain(d.warnAfterCompletion);
    expect(tranche(1).textContent).toContain(d.warnSameDate);
    expect(tranche(3).textContent).toContain(d.warnSameDate);
    const warning = within(tranche(2)).getByText(d.warnAfterCompletion);
    expect(warning.getAttribute("role")).toBeNull();
    expect(tranche(2).getAttribute("aria-describedby")).toContain(warning.id);
    await userEvent.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(saved().draws).toHaveLength(3);
  });

  it("a Standard block keeps the initial principal in the grid and has no schedule", async () => {
    await openEdit(plain);
    expect(screen.queryByRole("group", { name: d.fieldDraws })).toBeNull();
    expect(
      screen.getByLabelText(new RegExp(`^${d.fieldInitialPrincipal}`)),
    ).toBeTruthy();
  });

  it("labels the total loan in the mortgage table", () => {
    render(<MortgagesPanel propertyId="dubova" rows={[dev]} />);
    expect(
      screen.getByText(
        `${d.tranches(1)} · ${d.totalLoan(fmtCzk(money("3534500")))} · ${d.ioUntil("31.03.2025")}`,
      ),
    ).toBeTruthy();
  });
});

describe("row editor focus (ADR 0167 §4)", () => {
  it("adding a prepayment focuses its date", async () => {
    await openEdit(plain);
    await userEvent.click(
      screen.getByRole("button", { name: d.eventAddPrepayment }),
    );
    const row = screen.getByRole("group", { name: d.eventPrepaymentRow(1) });
    expect(document.activeElement).toBe(cell(row, d.eventDate));
  });
});
