// @vitest-environment jsdom
//
// ADR 0253 (#444), on the real store and a seeded in-memory DB: while a save or a delete
// runs, every row write action is disabled (record tables, Properties, scenarios, the
// holding-costs pencil), and enabled again once it settles. Duplicate gets focus back
// after its own write (ADR 0248 §2).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValuationsPanel } from "../PropertyEntityPanels";
import { Properties } from "../Properties";
import { Scenarios } from "../Scenarios";
import { HoldingCostsPanel } from "../propertyDetail/HoldingCostsPanel";
import { usePortfolioStore, portfolioDb } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import {
  openMemorySql,
  type TestSql,
} from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { money, type IsoDate } from "../../../engine";
import { en } from "../../../i18n/en";

// The compare runs the engine; these tests need the scenario list only.
vi.mock("../ScenarioCompare", () => ({ ScenarioCompareView: () => null }));

let db: TestSql;

beforeEach(async () => {
  db = openMemorySql();
  await act(() =>
    usePortfolioStore.getState().init(async () => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    }),
  );
});

const store = () => usePortfolioStore.getState();

/** From now on every write's read-back waits: the write runs until `release()`, which
 *  lets it finish and waits for the page to settle. */
function holdWrites() {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  portfolioDb.set({
    ...db,
    selectSnapshot: async (statements) => {
      await opened;
      return db.selectSnapshot(statements);
    },
  });
  return () =>
    act(async () => {
      open();
      await new Promise((r) => setTimeout(r, 0));
    });
}

const disabled = (buttons: HTMLElement[]) =>
  buttons.map((b) => (b as HTMLButtonElement).disabled);
const edits = () => screen.getAllByRole("button", { name: en.common.edit });
const deletes = () => screen.getAllByRole("button", { name: en.common.delete });

/** A write that is no row's own: a valuation on the first property. */
const otherWrite = () =>
  store().addValuation({
    id: "elsewhere",
    propertyId: store().portfolio!.properties[0]!.id,
    validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
    marketValue: money("1"),
  });

describe("record table Edit and Delete (ADR 0253)", () => {
  function Live() {
    const portfolio = usePortfolioStore((s) => s.portfolio);
    return (
      <ValuationsPanel
        propertyId="javorova"
        rows={portfolio!.valuations.filter((v) => v.propertyId === "javorova")}
      />
    );
  }

  it("are disabled while the row's save runs", async () => {
    render(<Live />);
    await userEvent.click(edits()[0]!);
    const release = holdWrites();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(disabled([...edits(), ...deletes()])).toEqual([true, true]);
    await release();
    expect(disabled([...edits(), ...deletes()])).toEqual([false, false]);
  });

  it("are disabled while the row's delete runs", async () => {
    render(<Live />);
    await userEvent.click(deletes()[0]!);
    const release = holdWrites();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(disabled([...edits(), ...deletes()])).toEqual([true, true]);
    await release();
    expect(screen.queryByRole("button", { name: en.common.edit })).toBeNull();
  });
});

describe("Properties Edit and Delete (ADR 0253)", () => {
  it("are disabled while a property's delete runs", async () => {
    act(() => useUiStore.setState({ route: "properties" }));
    render(<Properties />);
    const rows = edits().length;
    expect(rows).toBe(store().portfolio!.properties.length);
    await userEvent.click(deletes()[0]!);
    const release = holdWrites();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(disabled([...edits(), ...deletes()])).toEqual(
      Array<boolean>(rows * 2).fill(true),
    );
    await release();
    expect(disabled([...edits(), ...deletes()])).toEqual(
      Array<boolean>((rows - 1) * 2).fill(false),
    );
  });
});

describe("scenario Edit, Duplicate and Delete (ADR 0253)", () => {
  const duplicates = () =>
    screen.getAllByRole<HTMLButtonElement>("button", {
      name: en.scenarios.duplicate,
    });
  const rowButtons = () => [...edits(), ...duplicates(), ...deletes()];

  beforeEach(async () => {
    await act(() =>
      store().addScenario({ id: "s1", name: "Rates up", overrides: {} }),
    );
    act(() => useUiStore.setState({ route: "scenarios" }));
  });

  it("are disabled while the scenario form's save runs", async () => {
    render(<Scenarios />);
    await userEvent.click(edits()[0]!);
    const release = holdWrites();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: en.common.save }),
    );
    expect(disabled(rowButtons())).toEqual([true, true, true]);
    await release();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(disabled(rowButtons())).toEqual([false, false, false]);
  });

  it("Duplicate is disabled while its write runs and gets focus back after it", async () => {
    render(<Scenarios />);
    const duplicate = duplicates()[0]!;
    const release = holdWrites();
    await userEvent.click(duplicate);
    expect(disabled(rowButtons())).toEqual([true, true, true]);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => duplicate.blur());
    expect(document.activeElement).toBe(document.body);
    await release();
    expect(duplicates()).toHaveLength(2);
    expect(duplicate.disabled).toBe(false);
    expect(document.activeElement).toBe(duplicate);
  });
});

describe("the holding-costs pencil (ADR 0253)", () => {
  it("is disabled while a write runs", async () => {
    const holding = store().portfolio!.holdingCosts[0]!;
    render(
      <HoldingCostsPanel
        holding={holding}
        propertyId={holding.propertyId}
        defaults={store().assumptions!.defaults}
        onSave={store().saveHoldingCost}
        onSaved={() => undefined}
      />,
    );
    const pencil = () =>
      screen.getByRole<HTMLButtonElement>("button", {
        name: en.propertyDetail.editHoldingCosts,
      });
    const release = holdWrites();
    let write!: Promise<unknown>;
    act(() => {
      write = otherWrite();
    });
    expect(pencil().disabled).toBe(true);
    await release();
    await act(() => write);
    expect(pencil().disabled).toBe(false);
  });
});
