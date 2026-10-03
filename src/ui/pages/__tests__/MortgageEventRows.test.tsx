// @vitest-environment jsdom
//
// ADR 0116 §11: the mortgage form edits a block's prepayments and recasts in a row
// editor. Saving replaces the stored events; a stored event an edit made invalid shows
// on its row and can be removed there (review of PR #91, item 8).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MortgagesPanel } from "../PropertyEntityPanels";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import {
  isoDate,
  money,
  validatePortfolio,
  type MortgageBlock,
} from "../../../engine";
import { portfolio } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const d = en.propertyDetail;
const seed = portfolio.mortgages.find((m) => m.propertyId === "javorova")!;

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
  render(<MortgagesPanel propertyId="javorova" rows={[block]} />);
  await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
}

const prepayments = () =>
  screen.getByRole("group", { name: d.fieldPrepayments });
const row = (n: number) =>
  within(prepayments()).getByRole("group", { name: d.eventPrepaymentRow(n) });
const saveButton = () =>
  screen.getByRole("button", { name: en.common.saveChanges });
const saved = () => save.mock.calls.at(-1)![0];

describe("prepayment and recast rows (ADR 0116)", () => {
  it("adds a prepayment row with labelled cells, marks the form unsaved, and saves it", async () => {
    await openEdit(seed);
    await userEvent.click(
      screen.getByRole("button", { name: d.eventAddPrepayment }),
    );
    expect(useUiStore.getState().unsavedChanges).toBe(true);
    const r = row(1);
    await userEvent.type(within(r).getByLabelText(d.eventDate), "17.01.2031");
    await userEvent.type(within(r).getByLabelText(d.eventAmount), "500000");
    await userEvent.selectOptions(
      within(r).getByLabelText(d.eventEffect),
      "shortenTerm",
    );
    await userEvent.click(saveButton());
    expect(saved().prepayments).toEqual([
      {
        date: isoDate("2031-01-17"),
        amount: money(500000),
        effect: "shortenTerm",
      },
    ]);
    expect(saved().recasts).toBeUndefined();
  });

  it("shows stored events in date order; removing every row clears them", async () => {
    await openEdit({
      ...seed,
      prepayments: [
        {
          date: isoDate("2031-01-17"),
          amount: money(1000),
          effect: "shortenTerm",
        },
      ],
      recasts: [{ date: isoDate("2032-01-17"), instalment: money(9000) }],
    });
    const recast = screen.getByRole("group", { name: d.eventRecastRow(1) });
    expect(
      (within(recast).getByLabelText(d.eventInstalment) as HTMLInputElement)
        .value,
    ).toBe("9000");
    await userEvent.click(
      within(row(1)).getByRole("button", {
        name: d.eventRemove(d.eventPrepaymentRow(1)),
      }),
    );
    await userEvent.click(
      within(recast).getByRole("button", {
        name: d.eventRemove(d.eventRecastRow(1)),
      }),
    );
    await userEvent.click(saveButton());
    expect(saved().prepayments).toBeUndefined();
    expect(saved().recasts).toBeUndefined();
  });

  it("marks a cell that does not parse and does not save", async () => {
    await openEdit(seed);
    await userEvent.click(
      screen.getByRole("button", { name: d.eventAddPrepayment }),
    );
    await userEvent.type(
      within(row(1)).getByLabelText(d.eventDate),
      "17.01.2031",
    );
    await userEvent.type(within(row(1)).getByLabelText(d.eventAmount), "x");
    await userEvent.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    expect(
      within(prepayments()).getByText(en.forms.invalidHint.prepayments),
    ).toBeTruthy();
    expect(
      within(row(1)).getByLabelText(d.eventAmount).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      within(row(1)).getByLabelText(d.eventDate).getAttribute("aria-invalid"),
    ).not.toBe("true");
  });

  it("a stored event a start-date edit made invalid shows on its row, and saves once removed", async () => {
    await openEdit({
      ...seed,
      prepayments: [
        {
          date: isoDate("2021-03-01"),
          amount: money(1000),
          effect: "shortenTerm",
        },
        {
          date: isoDate("2031-01-17"),
          amount: money(1000),
          effect: "shortenTerm",
        },
      ],
    });
    const start = screen.getByLabelText(new RegExp(`^${d.fieldStartDate}`));
    await userEvent.clear(start);
    await userEvent.type(start, "17.04.2021");
    await userEvent.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(row(1).textContent).toContain(en.inputRules.EVENT_BEFORE_START);
    expect(row(1).getAttribute("aria-describedby")).toBeTruthy();
    expect(row(2).textContent).not.toContain(en.inputRules.EVENT_BEFORE_START);
    await userEvent.click(
      within(row(1)).getByRole("button", {
        name: d.eventRemove(d.eventPrepaymentRow(1)),
      }),
    );
    // The valid row moved up: the old row's error must not follow its position.
    expect(row(1).textContent).not.toContain(en.inputRules.EVENT_BEFORE_START);
    expect(row(1).getAttribute("aria-describedby")).toBeNull();
    await userEvent.click(saveButton());
    expect(save).toHaveBeenCalledTimes(2);
    expect(saved().prepayments).toHaveLength(1);
  });

  it("switching the loan type keeps the events", async () => {
    await openEdit({
      ...seed,
      prepayments: [
        {
          date: isoDate("2031-01-17"),
          amount: money(1000),
          effect: "shortenTerm",
        },
      ],
    });
    const type = screen.getByRole("group", { name: d.loanType });
    await userEvent.click(
      within(type).getByRole("button", { name: d.loanTypeDevelopment }),
    );
    await userEvent.click(
      within(type).getByRole("button", { name: d.loanTypeStandard }),
    );
    expect(row(1)).toBeTruthy();
    await userEvent.click(saveButton());
    expect(saved().prepayments).toHaveLength(1);
  });
});
