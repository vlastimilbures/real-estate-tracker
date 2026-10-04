// @vitest-environment jsdom
//
// ADR 0127 (#101, #105): a new property's id is random, never made from its name. A name
// without Latin letters used to get the id "", and "Dubová" got the sample's id `dubova`.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyFormModal } from "../PropertyFormModal";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import {
  portfolio,
  assumptions,
  withPropertyId,
} from "../../../engine/__tests__/support/seed";
import type { HoldingCost, Property } from "../../../engine";
import type { MutationResult } from "../../../state/portfolioStore";

const f = getDict("en").propertyForm;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let addProperty: ReturnType<
  typeof vi.fn<(p: Property, c: HoldingCost) => Promise<MutationResult>>
>;
let editProperty: ReturnType<
  typeof vi.fn<(p: Property) => Promise<MutationResult>>
>;

beforeEach(() => {
  addProperty = vi.fn(() => Promise.resolve({ ok: true as const }));
  editProperty = vi.fn(() => Promise.resolve({ ok: true as const }));
  act(() => {
    useUiStore.setState({ language: "en" });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      addProperty,
      editProperty,
      getPropertyExtras: () => Promise.resolve({ address: null, garage: null }),
    });
  });
});

async function add(name: string) {
  render(<PropertyFormModal mode="add" onClose={() => undefined} />);
  await userEvent.type(screen.getByLabelText(f.name), name);
  await userEvent.type(screen.getByLabelText(f.purchaseDate), "01.03.2021");
  await userEvent.type(screen.getByLabelText(f.purchasePrice), "5200000");
  await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
}

describe("a new property's id (ADR 0127)", () => {
  it.each(["Квартира на Тверской", "Dubová"])(
    "is random, not made from the name %s",
    async (name) => {
      await add(name);
      const [property, cost] = addProperty.mock.calls[0]!;
      expect(property.name).toBe(name);
      expect(property.id).toMatch(UUID);
      expect(cost).toEqual({
        id: `hc-${property.id}`,
        propertyId: property.id,
      });
    },
  );

  it("stays the same when a failed save is retried", async () => {
    addProperty.mockResolvedValueOnce({
      ok: false,
      error: { kind: "other", message: "disk busy" },
    });
    await add("Byt Nový");
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    expect(addProperty).toHaveBeenCalledTimes(2);
    expect(addProperty.mock.calls[1]![0].id).toBe(
      addProperty.mock.calls[0]![0].id,
    );
  });
});

describe("an edited property's id (ADR 0127)", () => {
  it('saves a property stored with the id "" under that id', async () => {
    const own = portfolio.properties[0]!;
    act(() =>
      usePortfolioStore.setState({ portfolio: withPropertyId(own.id, "") }),
    );
    render(
      <PropertyFormModal mode="edit" propertyId="" onClose={() => undefined} />,
    );
    await screen.findByDisplayValue(own.name);
    await userEvent.click(
      screen.getByRole("button", { name: getDict("en").common.saveChanges }),
    );
    expect(editProperty).toHaveBeenCalledTimes(1);
    expect(editProperty.mock.calls[0]![0]).toMatchObject({
      id: "",
      name: own.name,
    });
  });
});
