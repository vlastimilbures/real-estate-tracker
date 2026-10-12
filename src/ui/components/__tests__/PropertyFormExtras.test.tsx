// @vitest-environment jsdom
//
// ADR 0184 §3: the edit form reads address and garage separately. Save waits for that
// read, and stays disabled with an error when it fails, so it can never write them NULL.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyFormModal } from "../PropertyFormModal";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const id = portfolio.properties[0]!.id;
type Extras = { address: string | null; garage: boolean | null };

let editProperty: ReturnType<typeof vi.fn<() => Promise<MutationResult>>>;
let settle: { resolve: (e: Extras) => void; reject: (e: Error) => void };

beforeEach(() => {
  editProperty = vi.fn(() => Promise.resolve({ ok: true } as const));
  act(() => {
    useUiStore.setState({ language: "en" });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      editProperty,
      getPropertyExtras: () =>
        new Promise<Extras>((resolve, reject) => {
          settle = { resolve, reject };
        }),
    });
  });
});

const save = () => screen.getByRole("button", { name: en.common.saveChanges });

describe("edit form waits for address and garage (ADR 0184 §3)", () => {
  it("keeps Save disabled until they load, then fills them", async () => {
    render(
      <PropertyFormModal mode="edit" propertyId={id} onClose={() => {}} />,
    );
    expect(save()).toHaveProperty("disabled", true);
    // Enter in a field submits the form too; it must not save either.
    await userEvent.type(
      screen.getByLabelText(en.propertyForm.name),
      "{Enter}",
    );
    expect(editProperty).not.toHaveBeenCalled();

    await act(async () =>
      settle.resolve({ address: "Main St 1", garage: true }),
    );
    expect(save()).toHaveProperty("disabled", false);
    expect(screen.getByLabelText(en.propertyForm.address)).toHaveProperty(
      "value",
      "Main St 1",
    );
    await userEvent.click(save());
    expect(editProperty).toHaveBeenCalledWith(expect.anything(), {
      address: "Main St 1",
      garage: true,
    });
  });

  it("shows an error and keeps Save disabled when they fail to load", async () => {
    render(
      <PropertyFormModal mode="edit" propertyId={id} onClose={() => {}} />,
    );
    await act(async () => settle.reject(new Error("disk")));
    expect(screen.getByText(en.propertyForm.errExtrasLoad)).toBeTruthy();
    expect(save()).toHaveProperty("disabled", true);
    await userEvent.type(
      screen.getByLabelText(en.propertyForm.name),
      "{Enter}",
    );
    expect(editProperty).not.toHaveBeenCalled();
  });

  it("does not wait in the add form", () => {
    render(<PropertyFormModal mode="add" onClose={() => {}} />);
    expect(
      screen.getByRole("button", { name: en.propertyForm.addTitle }),
    ).toHaveProperty("disabled", false);
  });
});
