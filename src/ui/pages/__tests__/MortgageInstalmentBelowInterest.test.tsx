// @vitest-environment jsdom
//
// ADR 0264: a loan with a term whose instalment is at or below its first month's interest
// is refused on save, and the mortgage form shows the existing
// `inputRules.INSTALMENT_BELOW_INTEREST` text on the instalment field and stays open
// (ADR 0141). The save runs the store's own pre-write check.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MortgagesPanel } from "../PropertyEntityPanels";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { checkEdit, withRow } from "../../../state/portfolio/rules";
import { getDict } from "../../../i18n";
import { EngineInputError, money, type MortgageBlock } from "../../../engine";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { shownErrors } from "../../../__tests__/support/shownErrors";

const en = getDict("en");
const d = en.propertyDetail;
// Dubova: 3,034,500 Kč at 4.49 %; first month's interest 11,354.09 Kč.
const dubova = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;
const withTerm: MortgageBlock = { ...dubova, loanTermYears: 30 };

/** Saves like the store: its pre-write check runs first. */
const save = vi.fn(async (m: MortgageBlock) => {
  try {
    checkEdit(
      portfolio,
      (p) => ({ ...p, mortgages: withRow(p.mortgages, m) }),
      [m.id],
    );
    return { ok: true as const };
  } catch (e) {
    if (!(e instanceof EngineInputError)) throw e;
    return {
      ok: false as const,
      error: { kind: "input" as const, errors: e.errors },
    };
  }
});

beforeEach(() => {
  save.mockClear();
  act(() => {
    useUiStore.setState({ route: "property" });
    usePortfolioStore.setState({ saveMortgageBlock: save });
  });
});

const instalment = () =>
  screen.getByRole("textbox", {
    name: new RegExp(`^${d.fieldMonthlyInstalment}`),
  }) as HTMLInputElement;

describe("the mortgage form refuses a loan with a term below its interest (ADR 0264)", () => {
  it("shows the rule on the instalment field and keeps the dialog open", async () => {
    render(<MortgagesPanel propertyId="dubova" rows={[withTerm]} />);
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    await userEvent.clear(instalment());
    await userEvent.type(instalment(), "11354");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].monthlyInstalment.toFixed()).toBe(
      money("11354").toFixed(),
    );
    expect(instalment().getAttribute("aria-invalid")).toBe("true");
    expect(shownErrors()).toEqual({
      [d.fieldMonthlyInstalment]: en.inputRules.INSTALMENT_BELOW_INTEREST,
    });
    // Still open: its Save button is there.
    expect(
      screen.getByRole("button", { name: en.common.saveChanges }),
    ).toBeTruthy();
  });
});
