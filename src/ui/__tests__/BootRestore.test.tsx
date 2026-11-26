// @vitest-environment jsdom
//
// #115 (ADR 0153): a hand-edited row the app cannot read (ROW_INVALID) stops startup.
// The screen offers Restore a backup…, which runs the same checked restore as Settings,
// names the safety copy, and then lets the user into the app.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BootFailure } from "../components/BootFailure";
import { usePortfolioStore, portfolioDb } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { en } from "../../i18n/en";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson, type BackupFile } from "../../data/backup";
import type { Sql } from "../../data/sql";
import { invoke } from "@tauri-apps/api/core";
import { toActionError } from "../../state/actionError";
import type { CsvImportReport } from "../../state/csv";
import {
  readBackFailedOf,
  startupErrorOf,
  statusOf,
} from "../../__tests__/support/status";

const picked = { text: "" };
vi.mocked(invoke).mockImplementation((command: string) =>
  command === "open_backup_file"
    ? Promise.resolve({ name: "portfolio-backup.json", text: picked.text })
    : Promise.resolve(),
);
const logFailure = vi.hoisted(() => vi.fn());
vi.mock("../../state/diagnostics", async (actual) => ({
  ...(await actual<typeof import("../../state/diagnostics")>()),
  logFailure,
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
  logFailure.mockReset();
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
  it("a failed pick says why; the next pick forgets it and asks to confirm", async () => {
    vi.mocked(invoke).mockImplementationOnce(() =>
      Promise.reject("Operation not permitted (os error 1)"),
    );
    render(<BootFailure />);
    await userEvent.click(button(en.boot.restoreBackup));
    // The failure under the screen's text, not the confirm step's own warning.
    const errors = () =>
      Array.from(
        screen.getByRole("alert").querySelectorAll(".error-text"),
      ).filter((el) => !el.closest(".restore-confirm"));
    expect(errors()).toHaveLength(1);
    expect(logFailure.mock.calls[0]?.[0]).toBe("RESTORE");
    await userEvent.click(button(en.boot.restoreBackup));
    expect(errors()).toHaveLength(0);
    expect(button(en.backup.restoreNow)).toBeDefined();
  });

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
    expect(statusOf(store())).toBe("error");

    await userEvent.click(button(en.boot.continue));
    expect(statusOf(store())).toBe("ready");
    expect(store().portfolio!.properties.length).toBeGreaterThan(0);
  });

  it("a Try again that fails again still names the safety copy (#136 review)", async () => {
    portfolioDb.set(reloadFails(db));
    await restoreFromScreen();
    const named = /portfolio-before-restore-.*\.json/.exec(
      screen.getByRole("alert").textContent ?? "",
    )?.[0];
    expect(named).toBeDefined();

    await userEvent.click(button(en.app.tryAgain));
    expect(statusOf(store())).toBe("error");
    expect(readBackFailedOf(store())).toBe(true);
    // In the app a failed init mounts a new screen: it still names the copy.
    cleanup();
    render(<BootFailure />);
    const alert = screen.getByRole("alert").textContent;
    expect(alert).toContain(en.boot.readBackFailed);
    expect(alert).toContain(named);
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

  // ADR 0154: replacing the data drops what described the old data (#468 pins it here).
  const leftovers = () =>
    act(() =>
      useUiStore.setState({
        failure: { action: "import", error: toActionError(new Error("x")) },
        lastImport: { items: [] } as unknown as CsvImportReport,
      }),
    );

  it("Continue drops the failure and the import report the old data left", async () => {
    leftovers();
    await restoreFromScreen();
    await userEvent.click(button(en.boot.continue));
    expect(useUiStore.getState().failure).toBeNull();
    expect(useUiStore.getState().lastImport).toBeNull();
  });

  it("a restore that cannot be read back drops them too", async () => {
    portfolioDb.set(reloadFails(db));
    leftovers();
    await restoreFromScreen();
    expect(screen.getByRole("alert").textContent).toContain(
      en.boot.readBackFailed,
    );
    expect(useUiStore.getState().failure).toBeNull();
    expect(useUiStore.getState().lastImport).toBeNull();
  });

  it("Cancel goes back without restoring", async () => {
    render(<BootFailure />);
    await userEvent.click(button(en.boot.restoreBackup));
    await userEvent.click(button(en.common.cancel));
    expect(button(en.boot.restoreBackup)).toBeDefined();
    expect(startupErrorOf(store())?.code).toBe("ROW_INVALID");
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

  it("a restore whose data cannot be read back shows the read-back screen and names the copy (ADR 0228)", async () => {
    portfolioDb.set(reloadFails(db));
    await restoreFromScreen();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(en.boot.readBackFailed);
    const named = /portfolio-before-restore-.*\.json/.exec(
      alert.textContent ?? "",
    )?.[0];
    expect(named).toBeDefined();
    expect(useUiStore.getState().notice).toEqual({
      kind: "restored",
      file: named,
    });
    expect(screen.queryByRole("button", { name: en.boot.continue })).toBeNull();
    expect(
      screen.queryByRole("button", { name: en.boot.restoreBackup }),
    ).toBeNull();
    expect(button(en.app.tryAgain)).toBeDefined();
    expect(statusOf(store())).toBe("error");
  });

  it("a failed restore is logged under RESTORE (#258 item 6)", async () => {
    portfolioDb.set({
      ...db,
      transaction: () => Promise.reject(new Error("disk full")),
    });
    await restoreFromScreen();

    expect(screen.getByRole("alert").textContent).toContain("disk full");
    expect(logFailure).toHaveBeenCalledOnce();
    expect(logFailure.mock.calls[0][0]).toBe("RESTORE");
  });
});
