// @vitest-environment jsdom
//
// ADR 0153, 0154: after a restore from the startup error screen whose data loaded, the
// app shows only the restored screen — the safety copy's name, Continue and Show data
// folder — until Continue. Nothing that describes the old data (a notice, a failure,
// an import report) shows there, so when that is dropped (at the restore, or at
// Continue) cannot be seen. Characterisation for #468, which moves the drop into the
// store's restore.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { APP_NAME } from "../../i18n";
import { en } from "../../i18n/en";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";
import { invoke } from "@tauri-apps/api/core";
import { toActionError } from "../../state/actionError";
import type { CsvImportReport } from "../../state/csv";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
const picked = { text: "" };
vi.mocked(invoke).mockImplementation((command: string) =>
  command === "open_backup_file"
    ? Promise.resolve({ name: "portfolio-backup.json", text: picked.text })
    : Promise.resolve(),
);
vi.mock("../../state/diagnostics", async (actual) => ({
  ...(await actual<typeof import("../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

let db: TestSql;
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(async () => {
  db = openMemorySql();
  await migrate(db);
  await seedIfEmpty(db);
  picked.text = JSON.stringify(await exportToJson(db, new Date()));
  await db.execute(
    "UPDATE leases SET monthly_rent = 'abc' WHERE id = (SELECT id FROM leases ORDER BY id LIMIT 1)",
  );
  await act(() => usePortfolioStore.getState().init(async () => db));
  // The app's own start retries from the error state; this one has started already.
  act(() => {
    usePortfolioStore.setState({ init: vi.fn(async () => {}) });
    useUiStore.setState({
      notice: { kind: "sampleCleared", file: "old-safety-copy.json" },
      failure: { action: "import", error: toActionError(new Error("x")) },
      lastImport: { items: [] } as unknown as CsvImportReport,
    });
  });
});

describe("between a startup restore and Continue", () => {
  it("the app shows only the restored screen", async () => {
    render(<App />);
    await userEvent.click(button(en.boot.restoreBackup));
    await userEvent.click(button(en.backup.restoreNow));
    const named = /portfolio-before-restore-.*?\.json/.exec(
      screen.getByRole("alert").textContent ?? "",
    )?.[0];
    expect(named).toBeDefined();
    expect(document.body.textContent).toBe(
      APP_NAME +
        en.backup.restored(named!) +
        en.boot.continue +
        en.boot.showDataFolder,
    );
  });
});
