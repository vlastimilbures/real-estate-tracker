// @vitest-environment jsdom
//
// #490 PR 3: where the record forms show a refused save, pinned before each form names
// its fields through one `errorField` (ADR 0261, #440). A failure naming a shown field
// shows on it; an event's on the draft row it came from, blank rows skipped (ADR 0116);
// the initial principal of a development loan on the schedule's first row (ADR 0167);
// anything else, a hidden field's included, above the buttons (ADR 0243).
import { describe, it, expect, beforeEach } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MortgagesPanel, ValuationsPanel } from "../PropertyEntityPanels";
import { SettingsPage } from "../Settings";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import type { WriteError } from "../../../state/writeError";
import { getDict } from "../../../i18n";
import {
  isoDate,
  money,
  type EngineValidationError,
  type MortgageBlock,
  type Valuation,
} from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { shownErrors } from "../../../__tests__/support/shownErrors";
import { dubovaDevLoan } from "../../../engine/__tests__/support/loan";

const en = getDict("en");
const d = en.propertyDetail;
const rule = en.inputRules.NEGATIVE_AMOUNT;

let refusal: WriteError;
const refuse = async () => ({ ok: false as const, error: refusal });

beforeEach(() => {
  act(() => {
    useUiStore.setState({ route: "property" });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      saveMortgageBlock: refuse,
      saveValuation: refuse,
      saveAssumptions: refuse,
    });
  });
});

const onField = (
  entity: "mortgage" | "valuation" | "assumptions",
  field?: string,
  index?: number,
): WriteError => ({
  kind: "input",
  errors: [
    {
      code: "NEGATIVE_AMOUNT",
      entity,
      id: "x",
      // Any name, the engine's or not, to pin where each one goes.
      ...(field !== undefined && {
        field: field as EngineValidationError["field"],
      }),
      ...(index !== undefined && { index }),
    },
  ],
});

const plain = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;
const dev = dubovaDevLoan();
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
  recasts: [{ date: isoDate("2034-01-17"), instalment: money("15000") }],
};
const save = () => screen.getByRole("button", { name: en.common.saveChanges });

/** Save an edit of `block` the store refuses with `error`, after `edit`: the errors. */
async function mortgageRefused(
  block: MortgageBlock,
  error: WriteError,
  edit: () => Promise<void> = async () => undefined,
) {
  refusal = error;
  cleanup();
  render(<MortgagesPanel propertyId="dubova" rows={[block]} />);
  await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
  await edit();
  await userEvent.click(save());
  await waitFor(() => expect(save().hasAttribute("disabled")).toBe(false));
  return shownErrors();
}

const prepayments = d.fieldPrepayments;
const prepayment = (n: number) => `${prepayments} › ${d.eventPrepaymentRow(n)}`;

describe("the mortgage form's save errors (ADR 0261, #490)", () => {
  it.each([
    ["startDate", d.fieldStartDate],
    ["initialPrincipal", d.fieldInitialPrincipal],
    ["fixationYears", d.fieldFixationYears],
    ["loanTermYears", d.fieldLoanTermYears],
    ["interestRatePa", d.fieldInterestRate],
    ["monthlyInstalment", d.fieldMonthlyInstalment],
    ["contractMaturityDate", d.fieldContractMaturity],
  ])("a rule on %s shows on its field", async (field, label) => {
    expect(
      await mortgageRefused(withEvents, onField("mortgage", field)),
    ).toEqual({ [label]: rule });
  });

  it.each([["completionDate"], ["draws"], ["propertyId"], [undefined]])(
    "a Standard loan shows a rule on %s above the buttons",
    async (field) => {
      expect(
        await mortgageRefused(withEvents, onField("mortgage", field)),
      ).toEqual({ form: rule });
    },
  );

  it("an event's rule shows on its row, and a list's on the list", async () => {
    expect(
      await mortgageRefused(withEvents, onField("mortgage", "prepayments", 1)),
    ).toEqual({ [prepayment(2)]: rule });
    expect(
      await mortgageRefused(withEvents, onField("mortgage", "recasts", 0)),
    ).toEqual({ [`${d.fieldRecasts} › ${d.eventRecastRow(1)}`]: rule });
  });

  it("an event's rule without its row shows on the list", async () => {
    expect(
      await mortgageRefused(withEvents, onField("mortgage", "prepayments")),
    ).toEqual({ [prepayments]: rule });
    expect(
      await mortgageRefused(withEvents, onField("mortgage", "prepayments", 5)),
    ).toEqual({ [prepayments]: rule });
  });

  it("an event's index skips a blank row before it", async () => {
    const shown = await mortgageRefused(
      withEvents,
      onField("mortgage", "prepayments", 0),
      async () => {
        const first = within(
          screen.getByRole("group", { name: d.eventPrepaymentRow(1) }),
        );
        await userEvent.clear(first.getByLabelText(d.eventDate));
        await userEvent.clear(first.getByLabelText(d.eventAmount));
      },
    );
    expect(shown).toEqual({ [prepayment(2)]: rule });
  });

  it("a development loan shows the principal and a tranche on the schedule", async () => {
    const schedule = d.fieldDraws;
    expect(
      await mortgageRefused(dev, onField("mortgage", "initialPrincipal")),
    ).toEqual({ [`${schedule} › ${d.drawnAtStart}`]: rule });
    expect(await mortgageRefused(dev, onField("mortgage", "draws", 0))).toEqual(
      { [`${schedule} › ${d.trancheRow(1)}`]: rule },
    );
    expect(
      await mortgageRefused(dev, onField("mortgage", "completionDate")),
    ).toEqual({ [d.fieldCompletionDate]: rule });
  });

  it("a CHECK or a duplicate start shows on the field it guards", async () => {
    expect(
      await mortgageRefused(withEvents, {
        kind: "constraint",
        constraint: { kind: "check", check: "mortgage_prepayments_json" },
      }),
    ).toEqual({ [prepayments]: en.writeErrors.invalidJson });
    expect(
      await mortgageRefused(withEvents, {
        kind: "constraint",
        constraint: {
          kind: "unique",
          table: "mortgage_blocks",
          columns: ["property_id", "start_date"],
        },
      }),
    ).toEqual({ [d.fieldStartDate]: en.inputRules.DUPLICATE_BLOCK_START });
  });

  it("any other failure shows above the buttons", async () => {
    expect(
      await mortgageRefused(withEvents, { kind: "other", message: "boom" }),
    ).toEqual({ form: "boom" });
  });
});

describe("the valuation form's save errors (ADR 0261, #490)", () => {
  const valuation: Valuation = portfolio.valuations.find(
    (v) => v.propertyId === "dubova",
  )!;

  async function valuationRefused(error: WriteError) {
    refusal = error;
    cleanup();
    render(<ValuationsPanel propertyId="dubova" rows={[valuation]} />);
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    await userEvent.click(save());
    await waitFor(() => expect(save().hasAttribute("disabled")).toBe(false));
    return shownErrors();
  }

  it("a rule on a shown field shows on it, anything else above", async () => {
    expect(await valuationRefused(onField("valuation", "marketValue"))).toEqual(
      { [d.fieldMarketValue]: rule },
    );
    expect(await valuationRefused(onField("valuation", "propertyId"))).toEqual({
      form: rule,
    });
  });
});

describe("the Assumptions form's save errors (ADR 0261, #490)", () => {
  /** Edit inflation and save; the store refuses with `error`. */
  async function assumptionsRefused(error: WriteError) {
    refusal = error;
    cleanup();
    render(<SettingsPage />);
    const input = screen.getByLabelText(en.assumptions.inflation);
    await userEvent.clear(input);
    await userEvent.type(input, "3");
    await userEvent.click(save());
    await waitFor(() => expect(save().hasAttribute("disabled")).toBe(false));
    return shownErrors();
  }
  // The summary above the fields lists the fields in error (ADR 0141).
  const listed = (text: string) => expect.stringContaining(text);

  it("a default's rule shows on its field, listed in the summary", async () => {
    const label = en.assumptions.mgmt;
    expect(
      await assumptionsRefused(onField("assumptions", "defaults.mgmtPctRent")),
    ).toEqual({ [label]: rule, form: listed(label) });
  });

  it("a top-level rule shows on its field, an unknown one in the summary", async () => {
    const label = en.assumptions.inflation;
    expect(
      await assumptionsRefused(onField("assumptions", "inflationPa")),
    ).toEqual({ [label]: rule, form: listed(label) });
    expect(await assumptionsRefused(onField("assumptions", "nope"))).toEqual({
      form: listed(rule),
    });
  });
});
