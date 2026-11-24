// @vitest-environment jsdom
//
// ADR 0246 (#538): Save changes disables while the save runs, which drops its focus to
// <body>. After a failed save the property form puts focus back on it, unless the user
// moved it.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyFormModal } from "../PropertyFormModal";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../../state/portfolioStore";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const id = portfolio.properties[0]!.id;
const failure: MutationResult = {
  ok: false,
  error: { kind: "other", message: "Disk full" },
};

let finish: (r: MutationResult) => void = () => undefined;

beforeEach(() => {
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      editProperty: () =>
        new Promise<MutationResult>((resolve) => (finish = resolve)),
      getPropertyExtras: () =>
        Promise.resolve({ address: "Stored St 1", garage: null }),
    });
  });
});

async function openForm() {
  render(<PropertyFormModal mode="edit" propertyId={id} onClose={() => {}} />);
  await screen.findByDisplayValue("Stored St 1");
}

const save = () =>
  screen.getByRole("button", {
    name: new RegExp(`^(${en.common.saveChanges}|${en.common.saving})$`),
  });

describe("PropertyFormModal focus after a failed save (ADR 0246)", () => {
  it("puts focus back on Save changes after the fixup dropped it to <body>", async () => {
    await openForm();
    await userEvent.click(save());
    expect(save()).toHaveProperty("disabled", true);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => save().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => finish(failure));
    expect(screen.getByRole("alert").textContent).toContain("Disk full");
    expect(document.activeElement).toBe(save());
  });

  it("leaves focus where the user moved it during the save", async () => {
    await openForm();
    await userEvent.click(save());
    const name = screen.getByLabelText(en.propertyForm.name);
    act(() => name.focus());
    await act(async () => finish(failure));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(name);
  });
});
