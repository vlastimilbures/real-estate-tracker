// @vitest-environment jsdom
//
// ADR 0148 (#133): a backup whose only problems are values outside the form ranges is not
// refused: the confirm step lists them and asks to restore anyway.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { BackupRestorePanel } from "../BackupRestore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { exportToJson } from "../../../data/backup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const restoreBackup = vi.fn();

/** The sample as a backup file, with one mortgage's fixation at 60 years. */
async function legacyBackupText(): Promise<string> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  sql.db
    .prepare(
      "UPDATE mortgage_blocks SET fixation_years = 60 WHERE id = (SELECT MIN(id) FROM mortgage_blocks)",
    )
    .run();
  const backup = await exportToJson(sql);
  sql.db.close();
  return JSON.stringify(backup);
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  restoreBackup.mockReset();
  act(() => {
    useUiStore.setState({ language: "en" });
    usePortfolioStore.setState({
      status: "ready",
      portfolio,
      assumptions,
      sample: { active: false, dismissed: false },
      restoreBackup,
    } as never);
  });
});

describe("Restore with out-of-range values (ADR 0148)", () => {
  it.fails("lists the values and asks to restore anyway (#133)", async () => {
    const text = await legacyBackupText();
    vi.mocked(invoke).mockResolvedValue({ name: "old.json", text });
    restoreBackup.mockResolvedValue({ safetyBackup: "safety.json" });
    render(<BackupRestorePanel />);

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );

    const anyway = await screen.findByRole("button", {
      name: "Restore anyway",
    });
    expect(screen.queryByText(en.backup.errRowsInvalid)).toBeNull();
    expect(
      screen.getByText(
        "This backup holds 1 value outside the ranges the forms accept. The app computes with it, and the Data check lists it after the restore. Restore anyway?",
      ),
    ).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("fixation_years")).toBeTruthy();
    expect(
      within(table).getByText(en.backup.issueOutOfRange("0", "50")),
    ).toBeTruthy();

    await userEvent.click(anyway);
    expect(restoreBackup).toHaveBeenCalledTimes(1);
  });
});
