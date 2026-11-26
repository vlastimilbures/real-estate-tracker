// @vitest-environment jsdom
//
// ADR 0095, 0221: the Assumptions buttons sit in the Settings top bar, which says
// whether there are unsaved edits, Discard changes resets the draft, and a failed save
// keeps the input and lists the fields that need attention as links.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../Settings";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Assumptions } from "../../../engine";
import type { MutationResult } from "../../../state/portfolioStore";

const en = getDict("en");
const save = vi.fn<(a: Assumptions) => Promise<MutationResult>>(async () => ({
  ok: true,
}));

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true });
  act(() => usePortfolioStore.setState({ saveAssumptions: save }));
});

const startsWith = (label: string) =>
  new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
const input = (label: string) =>
  screen.getByLabelText(startsWith(label)) as HTMLInputElement;

async function setField(label: string, text: string) {
  await userEvent.clear(input(label));
  if (text) await userEvent.type(input(label), text);
}

const saveButton = () =>
  screen.getByRole("button", { name: en.common.saveChanges });
const discardButton = () =>
  screen.getByRole("button", { name: en.common.discardChanges });

describe("Assumptions save row (ADR 0095)", () => {
  it("sits in the top bar, with no floating row under the fields (ADR 0221)", () => {
    const { container } = renderWithPortfolio(<SettingsPage />, {
      route: "settings",
    });
    const bar = container.querySelector("header.topbar") as HTMLElement;
    const row = within(bar);
    expect(row.getByText(en.common.allChangesSaved)).toBeTruthy();
    expect(row.getByRole("button", { name: en.common.discardChanges }));
    const save = row.getByRole("button", { name: en.common.saveChanges });
    // Save submits the Assumptions form from outside it.
    const form = container.querySelector("form.assumptions-form")!;
    expect((save as HTMLButtonElement).form).toBe(form);
    expect(container.querySelector(".sticky-actions")).toBeNull();
    expect(form.querySelector("[type=submit]")).toBeNull();
  });

  it("the Backup tab shows no Save or Discard", () => {
    act(() => useUiStore.setState({ settingsTab: "backup" }));
    const { container } = renderWithPortfolio(<SettingsPage />, {
      route: "settings",
    });
    const bar = within(container.querySelector("header.topbar") as HTMLElement);
    expect(
      bar.queryByRole("button", { name: en.common.saveChanges }),
    ).toBeNull();
    expect(
      bar.queryByRole("button", { name: en.common.discardChanges }),
    ).toBeNull();
  });

  it("is clean at first: says so and disables both buttons", () => {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    expect(screen.getByText(en.common.allChangesSaved)).toBeTruthy();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    expect((discardButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("an edit shows Unsaved changes and enables the buttons", async () => {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await setField(en.assumptions.inflation, "3");
    expect(screen.getByText(en.common.unsavedChanges)).toBeTruthy();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
    expect((discardButton() as HTMLButtonElement).disabled).toBe(false);
    expect(useUiStore.getState().unsavedChanges).toBe(true);
  });

  it("Discard changes restores the saved values and clears the unsaved state", async () => {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    const before = input(en.assumptions.inflation).value;
    await setField(en.assumptions.inflation, "9");
    await userEvent.click(discardButton());
    expect(input(en.assumptions.inflation).value).toBe(before);
    expect(screen.getByText(en.common.allChangesSaved)).toBeTruthy();
    expect(useUiStore.getState().unsavedChanges).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("reads Saving… while the save runs", async () => {
    let finish: (r: MutationResult) => void = () => undefined;
    save.mockImplementation(
      () => new Promise<MutationResult>((r) => (finish = r)),
    );
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await setField(en.assumptions.inflation, "3");
    await userEvent.click(saveButton());
    const busy = screen.getByRole("button", { name: en.common.saving });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ ok: true }));
    expect(screen.getByText(en.common.allChangesSaved)).toBeTruthy();
  });

  it("a failed write keeps the input and says so", async () => {
    save.mockResolvedValue({
      ok: false,
      error: { kind: "other", message: "disk I/O error" },
    });
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await setField(en.assumptions.inflation, "3");
    await userEvent.click(saveButton());
    expect(screen.getByText(en.common.saveFailedKept)).toBeTruthy();
    expect(input(en.assumptions.inflation).value).toBe("3");
    // The next edit is simply unsaved again.
    await userEvent.type(input(en.assumptions.inflation), "5");
    expect(screen.getByText(en.common.unsavedChanges)).toBeTruthy();
  });
});

describe("Assumptions error summary (ADR 0095)", () => {
  it("lists the invalid fields as links, takes focus, and each link focuses its field", async () => {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await setField(en.assumptions.inflation, "");
    await setField(en.assumptions.other, "-5");
    await userEvent.click(saveButton());
    expect(save).not.toHaveBeenCalled();

    const summary = screen.getByRole("group", {
      name: en.common.fieldsNeedAttention(2),
    });
    expect(document.activeElement).toBe(summary);
    expect(screen.getByText(en.common.saveFailedKept)).toBeTruthy();

    const links = within(summary).getAllByRole("button");
    expect(links.map((l) => l.textContent)).toEqual([
      en.assumptions.inflation,
      en.assumptions.other,
    ]);
    // The always-underlined text button (ADR 0266).
    for (const l of links) expect(l.className).toBe("link-button underlined");
    await userEvent.click(links[1]!);
    expect(document.activeElement).toBe(input(en.assumptions.other));
  });

  it("goes away once the fields are fixed and saved", async () => {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await setField(en.assumptions.inflation, "");
    await userEvent.click(saveButton());
    expect(
      screen.getByRole("group", { name: en.common.fieldsNeedAttention(1) }),
    ).toBeTruthy();
    await setField(en.assumptions.inflation, "3");
    await userEvent.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".error-summary")).toBeNull();
  });
});
