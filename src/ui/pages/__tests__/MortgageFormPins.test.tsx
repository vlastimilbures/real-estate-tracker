// @vitest-environment jsdom
//
// #490 PR 2: what the mortgage form did before its draft became typed, pinned.
// - The loan-type switch alone is not unsaved input (ADR 0098): `loanType` is kept in
//   the draft but is not a field. Counting it would make the leave guard ask, an ADR
//   candidate, not done here.
// - Event rows are keyed by position: removing a row keeps the DOM nodes in place and
//   moves the later rows' values into them (stable ids are an ADR candidate).
// - A list counts as unsaved by its text: a row edited back to its first values is
//   clean, and Standard drops an added blank tranche row, so it leaves nothing unsaved.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MortgagesPanel } from "../PropertyEntityPanels";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { isoDate, money, type MortgageBlock } from "../../../engine";
import { portfolio } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const d = en.propertyDetail;
const plain = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;
const withEvents: MortgageBlock = {
  ...plain,
  prepayments: [
    {
      date: isoDate("2031-01-17"),
      amount: money("100000"),
      effect: "lowerInstalment",
    },
    {
      date: isoDate("2033-01-17"),
      amount: money("200000"),
      effect: "shortenTerm",
    },
  ],
};

beforeEach(() => {
  act(() => {
    useUiStore.setState({ route: "property" });
    usePortfolioStore.setState({
      addMortgageBlock: vi.fn(async () => ({ ok: true as const })),
      saveMortgageBlock: vi.fn(async () => ({ ok: true as const })),
    });
  });
});

const unsaved = () => screen.queryByText(en.common.unsavedChanges);
const typeButton = (label: string) =>
  within(screen.getByRole("group", { name: d.loanType })).getByRole("button", {
    name: label,
  });
const prepaymentRow = (n: number) =>
  screen.getByRole("group", { name: d.eventPrepaymentRow(n) });
const amountOf = (row: HTMLElement) =>
  within(row).getByLabelText(d.eventAmount) as HTMLInputElement;

async function openEdit(block: MortgageBlock) {
  render(<MortgagesPanel propertyId="dubova" rows={[block]} />);
  await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
}

describe("the mortgage form's draft (#490)", () => {
  it("switching the loan type alone leaves the form clean", async () => {
    render(<MortgagesPanel propertyId="dubova" rows={[]} />);
    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(d.addMortgage) }),
    );
    await userEvent.click(typeButton(d.loanTypeDevelopment));
    expect(typeButton(d.loanTypeDevelopment).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(unsaved()).toBeNull();
  });

  it("an edited block switched to Development alone stays clean", async () => {
    await openEdit(plain);
    await userEvent.click(typeButton(d.loanTypeDevelopment));
    expect(unsaved()).toBeNull();
  });

  it("removing a row keeps the nodes by position", async () => {
    await openEdit(withEvents);
    const first = amountOf(prepaymentRow(1));
    const second = amountOf(prepaymentRow(2));
    await userEvent.click(
      within(prepaymentRow(1)).getByRole("button", {
        name: d.eventRemove(d.eventPrepaymentRow(1)),
      }),
    );
    const left = amountOf(prepaymentRow(1));
    expect(left).toBe(first);
    expect(left.value).toBe("200000");
    expect(second.isConnected).toBe(false);
  });

  it("a row edited back to its first values is clean", async () => {
    await openEdit(withEvents);
    const amount = amountOf(prepaymentRow(1));
    await userEvent.type(amount, "5");
    expect(unsaved()).not.toBeNull();
    await userEvent.type(amount, "{Backspace}");
    expect(amount.value).toBe("100000");
    expect(unsaved()).toBeNull();
  });

  it("Standard drops an added blank tranche row, leaving nothing unsaved", async () => {
    await openEdit(plain);
    await userEvent.click(typeButton(d.loanTypeDevelopment));
    await userEvent.click(screen.getByRole("button", { name: d.addTranche }));
    expect(unsaved()).not.toBeNull();
    await userEvent.click(typeButton(d.loanTypeStandard));
    expect(screen.queryByRole("group", { name: d.fieldDraws })).toBeNull();
    expect(unsaved()).toBeNull();
  });
});
