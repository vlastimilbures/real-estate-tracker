// The property actions on the happy path.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import type { IsoDate } from "../../engine";
import { money } from "../../engine";
import { noExtras } from "../../data/__tests__/support/noExtras";
import { openSeeded } from "./support/openSeeded";
import { unwrap } from "../../__tests__/support/result";

// Every mutation, invoked once on the happy path — a smoke test that each action's
// mapper + repository call round-trips through the DB and the refreshed in-memory state
// (a bad mapper would surface here). The shared mutate() failure path is covered in storeWrites.test.ts.
describe("portfolioStore mutations — happy path (all actions)", () => {
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

  const pf = () => usePortfolioStore.getState().portfolio!;
  const pid = () => pf().properties[0].id;

  it("addProperty (with holding cost) / editProperty / removeProperty", async () => {
    const before = pf().properties.length;
    const add = await usePortfolioStore.getState().addProperty(
      {
        id: "p-new",
        name: "Byt Test",
        purchaseDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
        purchasePrice: money("5000000"),
      },
      { id: "hc-new", propertyId: "p-new", svjMonthly: money("1000") },
      noExtras,
    );
    expect(add.ok).toBe(true);
    expect(pf().properties.length).toBe(before + 1);
    expect(pf().holdingCosts.some((h) => h.id === "hc-new")).toBe(true);

    const edit = await usePortfolioStore.getState().editProperty(
      {
        id: "p-new",
        name: "Byt Renamed",
        purchaseDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
        purchasePrice: money("5000000"),
      },
      { address: "Main St 1", garage: true },
    );
    expect(edit.ok).toBe(true);
    expect(pf().properties.find((p) => p.id === "p-new")!.name).toBe(
      "Byt Renamed",
    );

    const remove = await usePortfolioStore.getState().removeProperty("p-new");
    expect(remove.ok).toBe(true);
    expect(pf().properties.length).toBe(before);
  });

  it("addProperty persists the address & garage extras", async () => {
    const add = await usePortfolioStore.getState().addProperty(
      {
        id: "p-new",
        name: "Byt Test",
        purchaseDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
        purchasePrice: money("5000000"),
      },
      { id: "hc-new", propertyId: "p-new" },
      { address: "Main St 1", garage: true },
    );
    expect(add.ok).toBe(true);
    expect(
      unwrap(await usePortfolioStore.getState().getPropertyExtras("p-new")),
    ).toEqual({ address: "Main St 1", garage: true });
  });

  it("editProperty keeps an inactive property inactive", async () => {
    const id = pid();
    expect(
      (await usePortfolioStore.getState().setPropertyActive(id, false)).ok,
    ).toBe(true);
    // The edit form's Property carries no `active` flag.
    const edited = { ...pf().properties.find((p) => p.id === id)! };
    delete edited.active;
    const edit = await usePortfolioStore
      .getState()
      .editProperty({ ...edited, name: "Byt Renamed" }, noExtras);
    expect(edit.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === id)!;
    expect(saved.name).toBe("Byt Renamed");
    expect(saved.active).toBe(false);
  });

  it("editProperty keeps a stored funding record the edit does not carry (ADR 0119)", async () => {
    const id = pid();
    const stored = pf().properties.find((p) => p.id === id)!;
    const funding = {
      ownCash: money("1500000"),
      transactionCosts: money("95000"),
      note: "Deposit",
    };
    expect(
      (
        await usePortfolioStore
          .getState()
          .editProperty({ ...stored, funding }, noExtras)
      ).ok,
    ).toBe(true);
    // An edit with no record keeps the stored one; the form always sends one (ADR 0119 §8).
    const edited = { ...pf().properties.find((p) => p.id === id)! };
    delete edited.funding;
    const edit = await usePortfolioStore
      .getState()
      .editProperty({ ...edited, name: "Byt Renamed" }, noExtras);
    expect(edit.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === id)!;
    expect(saved.name).toBe("Byt Renamed");
    expect(saved.funding?.ownCash?.toString()).toBe("1500000");
    expect(saved.funding?.transactionCosts?.toString()).toBe("95000");
    expect(saved.funding?.initialWorks).toBeUndefined();
    expect(saved.funding?.note).toBe("Deposit");
  });

  it("editProperty clears a stored funding record with an empty one (ADR 0119 §8)", async () => {
    const id = pid();
    const stored = pf().properties.find((p) => p.id === id)!;
    const store = usePortfolioStore.getState();
    const funding = { ownCash: money("1500000"), note: "Deposit" };
    expect(
      (await store.editProperty({ ...stored, funding }, noExtras)).ok,
    ).toBe(true);
    expect(
      (await store.editProperty({ ...stored, funding: {} }, noExtras)).ok,
    ).toBe(true);
    expect(pf().properties.find((p) => p.id === id)!.funding).toBeUndefined();
  });

  it("editProperty saves the edit's record whole: a part it drops is cleared", async () => {
    const id = pid();
    const stored = pf().properties.find((p) => p.id === id)!;
    const store = usePortfolioStore.getState();
    const full = {
      ownCash: money("1500000"),
      transactionCosts: money("95000"),
      note: "Deposit",
    };
    expect(
      (await store.editProperty({ ...stored, funding: full }, noExtras)).ok,
    ).toBe(true);
    const edit = await store.editProperty(
      { ...stored, funding: { ownCash: money("1400000") } },
      noExtras,
    );
    expect(edit.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === id)!.funding;
    expect(saved?.ownCash?.toString()).toBe("1400000");
    expect(saved?.transactionCosts).toBeUndefined();
    expect(saved?.note).toBeUndefined();
  });

  it("addProperty persists a funding record", async () => {
    const add = await usePortfolioStore.getState().addProperty(
      {
        id: "p-new",
        name: "Byt Test",
        purchaseDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
        purchasePrice: money("5000000"),
        funding: { ownCash: money("0"), initialWorks: money("150000") },
      },
      { id: "hc-new", propertyId: "p-new" },
      noExtras,
    );
    expect(add.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === "p-new")!.funding;
    expect(saved?.ownCash?.toString()).toBe("0");
    expect(saved?.initialWorks?.toString()).toBe("150000");
    expect(saved?.transactionCosts).toBeUndefined();
  });
});
