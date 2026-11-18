// @vitest-environment jsdom
//
// ADR 0248 §4 (#549): the Assumptions Save in the Settings top bar disables while the
// save runs, which drops focus to <body>. A failed save that shows only in the banner
// puts focus back on Save. Focus the user moved stays where it is, and a save started by
// Return in a field keeps focus in that field.
import { beforeEach, describe, expect, it } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../Settings";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import type { MutationResult } from "../../../state/portfolioStore";
import { deferred, type Deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

const failure: MutationResult = {
  ok: false,
  error: { kind: "other", message: "disk I/O error" },
};

let write: Deferred<MutationResult>;

beforeEach(() => {
  write = deferred();
  act(() =>
    usePortfolioStore.setState({ saveAssumptions: () => write.promise }),
  );
});

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inflation = () =>
  screen.getByLabelText(new RegExp(`^${escaped(en.assumptions.inflation)}`));
const save = () =>
  screen.getByRole("button", {
    name: new RegExp(`^(${en.common.saveChanges}|${en.common.saving})$`),
  });

/** Render Settings with an edit to save, and an outside control to move focus to. */
async function renderEdited() {
  renderWithPortfolio(
    <>
      <SettingsPage />
      <button type="button">Elsewhere</button>
    </>,
    { route: "settings" },
  );
  await userEvent.clear(inflation());
  await userEvent.type(inflation(), "3");
}

describe("Assumptions Save focus after a failure (ADR 0248 §4)", () => {
  it("a failure shown only in the banner puts focus back on Save (#549)", async () => {
    await renderEdited();
    await userEvent.click(save());
    expect(save()).toHaveProperty("disabled", true);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => save().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => write.resolve(failure));
    expect(screen.getByText(en.common.saveFailedKept)).toBeTruthy();
    expect(document.activeElement).toBe(save());
  });

  it("leaves focus where the user moved it during the save", async () => {
    await renderEdited();
    await userEvent.click(save());
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => write.resolve(failure));
    expect(screen.getByText(en.common.saveFailedKept)).toBeTruthy();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("keeps focus in the field a save started from by Return", async () => {
    await renderEdited();
    await userEvent.keyboard("{Enter}");
    expect(save()).toHaveProperty("disabled", true);
    await act(async () => write.resolve(failure));
    expect(screen.getByText(en.common.saveFailedKept)).toBeTruthy();
    expect(document.activeElement).toBe(inflation());
  });
});
