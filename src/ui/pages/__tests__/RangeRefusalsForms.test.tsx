// @vitest-environment jsdom
//
// #464: the rendered forms refuse an out-of-range fixation, loan term and horizon with
// today's English text, pinned literally so moving the input rules cannot change it.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MortgagesPanel } from "../PropertyEntityPanels";
import { SettingsPage } from "../Settings";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { portfolio } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const ok = { ok: true as const };
const saveMortgageBlock = vi.fn(async () => ok);
const saveAssumptions = vi.fn(async () => ok);

beforeEach(() => {
  saveMortgageBlock.mockClear();
  saveAssumptions.mockClear();
  act(() => {
    useUiStore.setState({ route: "property" });
    usePortfolioStore.setState({ saveMortgageBlock, saveAssumptions });
  });
});

const startsWith = (label: string) =>
  new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

async function setField(label: string, text: string) {
  const input = screen.getByLabelText(startsWith(label));
  await userEvent.clear(input);
  await userEvent.type(input, text);
  return input;
}

const fieldText = (label: string) =>
  screen.getByLabelText(startsWith(label)).closest(".field")!.textContent;

const save = () =>
  userEvent.click(screen.getByRole("button", { name: en.common.saveChanges }));

describe("Financing form bounds (rendered)", () => {
  const block = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;

  it("refuses fixation 51 with the 0–50 range", async () => {
    render(<MortgagesPanel propertyId="dubova" rows={[block]} />);
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    await setField(en.propertyDetail.fieldFixationYears, "51");
    await save();
    expect(saveMortgageBlock).not.toHaveBeenCalled();
    expect(fieldText(en.propertyDetail.fieldFixationYears)).toContain(
      "Must be a whole number from 0 to 50",
    );
  });

  it("refuses loan term 51 with the 1–50 range", async () => {
    render(<MortgagesPanel propertyId="dubova" rows={[block]} />);
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    await setField(en.propertyDetail.fieldLoanTermYears, "51");
    await save();
    expect(saveMortgageBlock).not.toHaveBeenCalled();
    expect(fieldText(en.propertyDetail.fieldLoanTermYears)).toContain(
      "Must be a whole number from 1 to 50",
    );
  });
});

describe("Settings horizon bound (rendered)", () => {
  it("refuses horizon 101 with the 1–100 range", async () => {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await setField(en.assumptions.horizon, "101");
    await save();
    expect(saveAssumptions).not.toHaveBeenCalled();
    expect(fieldText(en.assumptions.horizon)).toContain(
      "Must be a whole number from 1 to 100",
    );
  });
});
