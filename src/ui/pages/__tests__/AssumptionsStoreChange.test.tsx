// @vitest-environment jsdom
//
// ADR 0095: the Assumptions form shows the stored values until the first edit, then the
// draft. A change to the stored assumptions underneath (a restore, another write) shows
// at once in an untouched form; a draft is kept as it is, compared with the new values.
// Characterisation for #488, which splits the form's hook.
import { describe, it, expect } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../Settings";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { getDict } from "../../../i18n";
import { money } from "../../../engine";

const en = getDict("en");
const startsWith = (label: string) =>
  new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
const input = (label: string) =>
  screen.getByLabelText(startsWith(label)) as HTMLInputElement;
const digits = (label: string) => input(label).value.replace(/\D/g, "");

/** The stored assumptions with Other costs set to `otherYr`. */
function storeOther(otherYr: string) {
  act(() => {
    const a = usePortfolioStore.getState().assumptions!;
    usePortfolioStore.setState({
      assumptions: {
        ...a,
        defaults: { ...a.defaults, otherYr: money(otherYr) },
      },
    });
  });
}

describe("the stored assumptions change under the form", () => {
  it("an untouched form shows the new values and stays saved", () => {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    storeOther("1234");
    expect(digits(en.assumptions.other)).toBe("1234");
    expect(screen.getByText(en.common.allChangesSaved)).toBeTruthy();
  });

  it("a draft is kept as it is and stays unsaved", async () => {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await userEvent.clear(input(en.assumptions.inflation));
    await userEvent.type(input(en.assumptions.inflation), "3");
    const otherBefore = digits(en.assumptions.other);
    storeOther("1234");
    expect(digits(en.assumptions.other)).toBe(otherBefore);
    expect(input(en.assumptions.inflation).value).toBe("3");
    expect(screen.getByText(en.common.unsavedChanges)).toBeTruthy();
  });
});
