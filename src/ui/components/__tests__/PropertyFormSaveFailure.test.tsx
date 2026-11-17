// @vitest-environment jsdom
//
// ADR 0241 (#438): the edit form takes the stored values once. A failed write reloads the
// store; that used to put the stored values back into the fields, so the typed edits were
// gone and Esc closed the dialog. A thrown save showed nothing.
import { describe, it, expect, beforeEach, vi } from "vitest";
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

let editProperty: ReturnType<typeof vi.fn<() => Promise<MutationResult>>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  onClose = vi.fn();
  editProperty = vi.fn(() => Promise.resolve({ ok: true } as const));
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      editProperty,
      getPropertyExtras: () =>
        Promise.resolve({ address: "Stored St 1", garage: null }),
    });
  });
});

const name = () => screen.getByLabelText(en.propertyForm.name);
const address = () => screen.getByLabelText(en.propertyForm.address);

async function openAndType() {
  render(<PropertyFormModal mode="edit" propertyId={id} onClose={onClose} />);
  await screen.findByDisplayValue("Stored St 1");
  await userEvent.clear(name());
  await userEvent.type(name(), "Byt Typed");
  await userEvent.clear(address());
  await userEvent.type(address(), "Typed St 9");
}

describe("a failed save keeps the typed values (ADR 0241)", () => {
  // #438: fails until the form takes the stored values once (ADR 0241 §1–2).
  it.fails(
    "keeps them, shows the error and stays unsaved after a write that reloads",
    async () => {
      // The store reloads after a failed write: a new portfolio object (#438).
      editProperty.mockImplementation(() => {
        usePortfolioStore.setState({ portfolio: { ...portfolio } });
        return Promise.resolve({
          ok: false,
          error: { kind: "other", message: "disk busy" },
        });
      });
      await openAndType();
      await userEvent.click(
        screen.getByRole("button", { name: en.common.saveChanges }),
      );
      expect(editProperty).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(name()).toHaveProperty("value", "Byt Typed");
      expect(address()).toHaveProperty("value", "Typed St 9");
      // Still unsaved, so Esc does not close the dialog (UX-029).
      await userEvent.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
    },
  );
});
