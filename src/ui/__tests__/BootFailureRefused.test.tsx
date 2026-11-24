// @vitest-environment jsdom
//
// ADR 0255 (#446): after a save whose read-back failed, the error screen names the queued
// writes it refused, under the saved-change message and inside the screen's alert. With
// nothing refused the screen is as before (ADR 0228).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { App } from "../App";
import { usePortfolioStore, portfolioDb } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { en } from "../../i18n/en";
import { cs } from "../../i18n/cs";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import type { Sql } from "../../data/sql";
import { money, type IsoDate } from "../../engine";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const alert = () => screen.getByRole("alert");
const listed = () =>
  within(alert())
    .queryAllByRole("listitem")
    .map((li) => li.textContent);

/** The app's startup call on mount, stubbed: the screen stays up. */
const init = vi.fn(async () => {});

function readBackFailed(refusedWrites: string[]) {
  act(() => {
    usePortfolioStore.setState({
      status: "error",
      readBackFailed: true,
      error: null,
      startupError: null,
      refusedWrites,
      init,
    } as never);
  });
}

describe("the read-back screen names the refused writes (ADR 0255)", () => {
  it("lists them under the saved-change message, in the alert", () => {
    readBackFailed(["leases", "restore"]);
    render(<App />);
    const text = alert().textContent ?? "";
    expect(text).toContain(en.boot.readBackFailed);
    expect(text).toContain(en.boot.notSaved);
    expect(text.indexOf(en.boot.readBackFailed)).toBeLessThan(
      text.indexOf(en.boot.notSaved),
    );
    expect(listed()).toEqual([en.backup.tables.leases, en.backup.restoreTitle]);
  });

  it("names them before the safety copy", () => {
    const file = "portfolio-before-restore-20261001T120000Z.json";
    act(() => useUiStore.getState().setNotice({ kind: "restored", file }));
    readBackFailed(["valuations"]);
    render(<App />);
    const text = alert().textContent ?? "";
    expect(listed()).toEqual([en.backup.tables.valuations]);
    expect(text.indexOf(en.backup.tables.valuations)).toBeLessThan(
      text.indexOf(en.backup.restored(file)),
    );
  });

  it("shows no line and no list when nothing was refused", () => {
    readBackFailed([]);
    render(<App />);
    expect(alert().textContent).toContain(en.boot.readBackFailed);
    expect(alert().textContent).not.toContain(en.boot.notSaved);
    expect(listed()).toEqual([]);
  });

  it("follows the language", () => {
    act(() => useUiStore.setState({ language: "cs" }));
    readBackFailed(["loadSample"]);
    render(<App />);
    expect(alert().textContent).toContain(cs.boot.notSaved);
    expect(listed()).toEqual([cs.sample.loadAction]);
  });
});

describe("a lease saved right behind a valuation whose read-back fails (ADR 0255)", () => {
  let db: TestSql;
  const store = () => usePortfolioStore.getState();
  /** `real`, but every load fails: the write commits, the read-back after it fails. */
  const reloadFails = (real: Sql): Sql => ({
    ...real,
    selectSnapshot: () => Promise.reject(new Error("database is locked")),
  });

  beforeEach(async () => {
    db = openMemorySql();
    await migrate(db);
    await seedIfEmpty(db);
    await act(() => store().init(async () => db));
  });

  it("is named on the screen", async () => {
    render(<App />);
    const lease = store().portfolio!.leases[0]!;
    portfolioDb.set(reloadFails(db));
    await act(async () => {
      const first = store().addValuation({
        id: "saved",
        propertyId: store().portfolio!.properties[0]!.id,
        validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
        marketValue: money("1"),
      });
      const queued = store().saveLease(lease);
      await first;
      await queued;
    });
    expect(alert().textContent).toContain(en.boot.readBackFailed);
    expect(alert().textContent).toContain(en.boot.notSaved);
    expect(listed()).toEqual([en.backup.tables.leases]);
  });
});
