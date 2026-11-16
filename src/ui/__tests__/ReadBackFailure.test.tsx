// @vitest-environment jsdom
//
// ADR 0228 (#446): a save that commits but cannot be read back leaves the app for the
// startup error screen; Try again reads the data again and returns to the same page.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { en } from "../../i18n/en";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import type { Sql } from "../../data/sql";
import { money, type IsoDate } from "../../engine";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

/** `real`, but every load fails: the write commits, the read-back after it fails. */
const reloadFails = (real: Sql): Sql => ({
  ...real,
  selectSnapshot: () => Promise.reject(new Error("database is locked")),
});

let db: TestSql;
const store = () => usePortfolioStore.getState();
const pageTitle = () => document.querySelector(".page-title")?.textContent;

beforeEach(async () => {
  db = openMemorySql();
  await migrate(db);
  await seedIfEmpty(db);
  await act(() => store().init(async () => db));
  act(() => useUiStore.setState({ route: "properties" }));
});

describe("a save whose read-back fails (ADR 0228)", () => {
  it("shows the error screen, and Try again returns to the same page", async () => {
    render(<App />);
    await waitFor(() => expect(pageTitle()).toBe(en.nav.properties));

    usePortfolioStore.setState({ sql: reloadFails(db) });
    await act(() =>
      store().addValuation({
        id: "saved",
        propertyId: store().portfolio!.properties[0]!.id,
        validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
        marketValue: money("1"),
      }),
    );

    expect(screen.getByRole("alert").textContent).toContain(
      en.boot.readBackFailed,
    );
    expect(pageTitle()).toBeUndefined();

    usePortfolioStore.setState({ sql: db });
    await userEvent.click(
      screen.getByRole("button", { name: en.app.tryAgain }),
    );

    await waitFor(() => expect(pageTitle()).toBe(en.nav.properties));
    expect(store().portfolio!.valuations.some((v) => v.id === "saved")).toBe(
      true,
    );
  });
});
