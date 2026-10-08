// @vitest-environment jsdom
//
// #115 (ADR 0153): a hand-edited row the app cannot read (ROW_INVALID) stops startup.
// The screen offers Restore a backup…, which runs the same checked restore as Settings,
// names the safety copy, and then lets the user into the app.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BootFailure } from "../components/BootFailure";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { en } from "../../i18n/en";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson, type BackupFile } from "../../data/backup";
import type { Sql } from "../../data/sql";

const picked = vi.hoisted(() => ({ text: "" }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string, args: { json?: string }) =>
    command === "open_backup_file"
      ? Promise.resolve({ name: "portfolio-backup.json", text: picked.text })
      : Promise.resolve(args.json),
  ),
}));

let db: TestSql;
let good: BackupFile;
const store = () => usePortfolioStore.getState();
const button = (name: string) => screen.getByRole("button", { name });

const reloadFails = (real: Sql): Sql => ({
  ...real,
  selectSnapshot: (statements) =>
    statements.some((s) => s.query.includes("schema_migrations"))
      ? real.selectSnapshot(statements)
      : Promise.reject(new Error("database is locked")),
});

beforeEach(async () => {
  act(() => useUiStore.setState({ language: "en", notice: null }));
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    status: "idle",
    error: null,
    startupError: null,
    stale: false,
  });
  db = openMemorySql();
  await migrate(db);
  await seedIfEmpty(db);
  good = await exportToJson(db, new Date());
  picked.text = JSON.stringify(good);
  await db.execute(
    "UPDATE leases SET monthly_rent = 'abc' WHERE id = (SELECT id FROM leases ORDER BY id LIMIT 1)",
  );
  await act(() => store().init(async () => db));
});

async function restoreFromScreen() {
  render(<BootFailure />);
  await userEvent.click(button(en.boot.restoreBackup));
  await userEvent.click(button(en.backup.restoreNow));
}

describe("restore from the startup error screen (ROW_INVALID)", () => {
  it("offers Restore a backup… and the next step, not Try again", () => {
    render(<BootFailure />);
    expect(screen.getByRole("alert").textContent).toContain(
      en.boot.nextRowInvalid,
    );
    expect(button(en.boot.restoreBackup)).toBeDefined();
    expect(screen.queryByRole("button", { name: en.app.tryAgain })).toBeNull();
  });

  it("restores, names the safety copy, then continues into the app", async () => {
    await restoreFromScreen();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/portfolio-before-restore-.*\.json/);
    expect(store().status).toBe("error");

    await userEvent.click(button(en.boot.continue));
    expect(store().status).toBe("ready");
    expect(store().portfolio!.properties.length).toBeGreaterThan(0);
  });

  it("a Try again that fails again still names the safety copy (#136 review)", async () => {
    usePortfolioStore.setState({ sql: reloadFails(db) });
    await restoreFromScreen();
    const named = /portfolio-before-restore-.*\.json/.exec(
      screen.getByRole("alert").textContent ?? "",
    )?.[0];
    expect(named).toBeDefined();
    // Try again: the notice is set before init, which unmounts this screen; a failed
    // init mounts a new one.
    act(() =>
      useUiStore.getState().setNotice({ kind: "restored", file: named! }),
    );
    cleanup();

    render(<BootFailure />);
    expect(screen.getByRole("alert").textContent).toContain(named);
    expect(button(en.app.tryAgain)).toBeDefined();
  });

  it("Continue keeps the safety copy's name in the app (#136)", async () => {
    await restoreFromScreen();
    const named = /portfolio-before-restore-.*\.json/.exec(
      screen.getByRole("alert").textContent ?? "",
    )?.[0];
    expect(named).toBeDefined();

    await userEvent.click(button(en.boot.continue));
    expect(useUiStore.getState().notice).toEqual({
      kind: "restored",
      file: named,
    });
  });

  it("Cancel goes back without restoring", async () => {
    render(<BootFailure />);
    await userEvent.click(button(en.boot.restoreBackup));
    await userEvent.click(button(en.common.cancel));
    expect(button(en.boot.restoreBackup)).toBeDefined();
    expect(store().startupError?.code).toBe("ROW_INVALID");
  });

  it("a refused file shows why, and the screen stays", async () => {
    picked.text = "not json";
    render(<BootFailure />);
    await userEvent.click(button(en.boot.restoreBackup));
    expect(screen.getByRole("alert").textContent).toContain(
      en.backup.errNotJson,
    );
    expect(button(en.boot.restoreBackup)).toBeDefined();
  });

  it("a restore whose data cannot be loaded names the copy and offers Try again", async () => {
    usePortfolioStore.setState({ sql: reloadFails(db) });
    await restoreFromScreen();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/portfolio-before-restore-.*\.json/);
    expect(screen.queryByRole("button", { name: en.boot.continue })).toBeNull();
    expect(button(en.app.tryAgain)).toBeDefined();
    expect(store().status).toBe("error");
  });
});
