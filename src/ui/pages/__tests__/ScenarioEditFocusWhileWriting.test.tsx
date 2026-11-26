// @vitest-environment jsdom
//
// ADR 0253 §5 on the real store and a seeded in-memory DB: scenario Edit stays on the page
// behind its dialog, so it is disabled during that form's save too. The write count falls
// before the save's caller resumes, so when the dialog closes its focus return finds Edit
// enabled again (the ordering Duplicate relies on, ADR 0248).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { usePortfolioStore, portfolioDb } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import {
  openMemorySql,
  type TestSql,
} from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { en } from "../../../i18n/en";

// The compare runs the engine; this test needs the scenario list only.
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
  await act(() =>
    usePortfolioStore
      .getState()
      .addScenario({ id: "s1", name: "Rates up", overrides: {} }),
  );
  act(() => useUiStore.setState({ route: "scenarios" }));
});

/** From now on every write's read-back waits until `release()`. */
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

describe("scenario Edit during its own form's save (ADR 0253 §5)", () => {
  it("is disabled while the save runs and gets focus back when the dialog closes", async () => {
    render(<Scenarios />);
    const edit = screen.getByRole<HTMLButtonElement>("button", {
      name: en.common.edit,
    });
    await userEvent.click(edit);
    const release = holdWrites();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: en.common.save,
      }),
    );
    expect(edit.disabled).toBe(true);
    await release();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(edit.disabled).toBe(false);
    expect(document.activeElement).toBe(edit);
  });
});
