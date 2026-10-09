// @vitest-environment jsdom
//
// ADR 0098: the mortgage form starts with a Standard | Development switch. Standard
// hides the drawdown schedule (ADR 0167) and the completion date; the type comes from the block's data; going
// back to Standard with development data asks first and clears it; a note says a new
// block replaces the current one.
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
const dev: MortgageBlock = {
  ...plain,
  id: "m-dev",
  loanTermYears: 30,
  draws: [{ date: isoDate("2024-09-01"), amount: money("500000") }],
  completionDate: isoDate("2025-03-31"),
};

const add = vi.fn(async () => ({ ok: true as const }));
const save = vi.fn(async () => ({ ok: true as const }));

beforeEach(() => {
  add.mockClear();
  save.mockClear();
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "property",
      unsavedSources: [],
      unsavedChanges: false,
    });
    usePortfolioStore.setState({
      addMortgageBlock: add,
      saveMortgageBlock: save,
    });
  });
});

const startsWith = (label: string) =>
  new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
const typeGroup = () => screen.getByRole("group", { name: d.loanType });
const typeButton = (label: string) =>
  within(typeGroup()).getByRole("button", { name: label });
const drawsField = () => screen.queryByRole("group", { name: d.fieldDraws });
/** The first tranche's amount, or "" when the schedule has no tranche row (ADR 0167). */
const firstTrancheAmount = () => {
  const row = within(drawsField()!).queryByRole("group", {
    name: d.trancheRow(1),
  });
  return row
    ? (within(row).getByLabelText(d.eventAmount) as HTMLInputElement).value
    : "";
};
const completionField = () =>
  screen.queryByLabelText(startsWith(d.fieldCompletionDate));

async function openAdd(rows: MortgageBlock[]) {
  render(<MortgagesPanel propertyId="dubova" rows={rows} />);
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(d.addMortgage) }),
  );
}

async function openEdit(rows: MortgageBlock[], index: number) {
  render(<MortgagesPanel propertyId="dubova" rows={rows} />);
  await userEvent.click(
    screen.getAllByRole("button", { name: en.common.edit })[index]!,
  );
}

describe("mortgage loan type (ADR 0098)", () => {
  it("a new block starts as Standard, without draws or completion date", async () => {
    await openAdd([]);
    expect(typeButton(d.loanTypeStandard).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(drawsField()).toBeNull();
    expect(completionField()).toBeNull();
    // Contract maturity stays in Standard.
    expect(
      screen.getByLabelText(startsWith(d.fieldContractMaturity)),
    ).toBeTruthy();
  });

  it("Development shows the draws and the completion date", async () => {
    await openAdd([]);
    await userEvent.click(typeButton(d.loanTypeDevelopment));
    expect(drawsField()).toBeTruthy();
    expect(completionField()).toBeTruthy();
  });

  it("an existing development block opens as Development with its data", async () => {
    await openEdit([plain, dev], 1);
    expect(typeButton(d.loanTypeDevelopment).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(firstTrancheAmount()).toBe("500000");
    expect((completionField() as HTMLInputElement).value).toBe("31.03.2025");
  });

  it("an existing plain block opens as Standard", async () => {
    await openEdit([plain], 0);
    expect(typeButton(d.loanTypeStandard).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(drawsField()).toBeNull();
  });

  it("saving a development block round-trips it unchanged", async () => {
    await openEdit([plain, dev], 1);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(save).toHaveBeenCalledTimes(1);
    const saved = (save.mock.calls[0] as unknown as [MortgageBlock])[0];
    expect(saved.draws?.map((x) => x.amount.toString())).toEqual(["500000"]);
    expect(saved.completionDate?.getTime()).toBe(dev.completionDate!.getTime());
  });

  it("switching to Standard with development data asks, Keep development keeps it", async () => {
    await openEdit([plain, dev], 1);
    await userEvent.click(typeButton(d.loanTypeStandard));
    expect(screen.getByText(d.loanTypeClearWarning)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: d.loanTypeKeepDevelopment }),
    );
    expect(screen.queryByText(d.loanTypeClearWarning)).toBeNull();
    expect(drawsField()).toBeTruthy();
    expect(firstTrancheAmount()).toBe("500000");
  });

  it("Clear and switch empties the development fields and hides them", async () => {
    await openEdit([plain, dev], 1);
    await userEvent.click(typeButton(d.loanTypeStandard));
    await userEvent.click(
      screen.getByRole("button", { name: d.loanTypeClearAndSwitch }),
    );
    expect(drawsField()).toBeNull();
    expect(completionField()).toBeNull();
    await userEvent.click(typeButton(d.loanTypeDevelopment));
    expect(firstTrancheAmount()).toBe("");
    expect((completionField() as HTMLInputElement).value).toBe("");
  });

  it("a blank tranche row left behind by going back to Standard is dropped, so nothing is unsaved", async () => {
    await openEdit([plain], 0);
    await userEvent.click(typeButton(d.loanTypeDevelopment));
    await userEvent.click(screen.getByRole("button", { name: d.addTranche }));
    await userEvent.click(typeButton(d.loanTypeStandard));
    expect(screen.queryByText(d.loanTypeClearWarning)).toBeNull();
    expect(useUiStore.getState().unsavedChanges).toBe(false);
  });

  it("switching an empty Development form back to Standard needs no confirm", async () => {
    await openAdd([]);
    await userEvent.click(typeButton(d.loanTypeDevelopment));
    await userEvent.click(typeButton(d.loanTypeStandard));
    expect(screen.queryByText(d.loanTypeClearWarning)).toBeNull();
    expect(drawsField()).toBeNull();
  });
});

describe("successor-block note (ADR 0098)", () => {
  it("shows on Add when the property already has a block, with a Guide link", async () => {
    await openAdd([plain]);
    expect(screen.getByText(d.successorNote)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: d.successorLearnMore }),
    );
    expect(useUiStore.getState().route).toBe("guide");
    expect(useUiStore.getState().guideTerm).toBe("fixation");
  });

  it("does not show for the first block", async () => {
    await openAdd([]);
    expect(screen.queryByText(d.successorNote)).toBeNull();
  });

  it("does not show when editing", async () => {
    await openEdit([plain, dev], 0);
    expect(screen.queryByText(d.successorNote)).toBeNull();
  });
});
