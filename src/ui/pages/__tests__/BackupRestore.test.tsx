// @vitest-environment jsdom
//
// #118 (R7-06): the restore flow on Settings → Backup. A picked backup asks for
// confirmation; Cancel leaves the data alone, Restore replaces it and names the safety
// backup; a refused file shows why.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { BackupRestorePanel } from "../BackupRestore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { logFailure } from "../../../state/diagnostics";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { exportToJson } from "../../../data/backup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

const restoreBackup = vi.fn();

/** The sample as a backup file, after `update` when given. */
async function backupText(update?: string): Promise<string> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  if (update) sql.db.prepare(update).run();
  const backup = await exportToJson(sql, new Date());
  sql.db.close();
  return JSON.stringify(backup);
}

/** Render the panel and pick a backup file holding `text`. */
async function pick(text: string) {
  vi.mocked(invoke).mockResolvedValue({ name: "backup.json", text });
  render(<BackupRestorePanel />);
  await userEvent.click(
    screen.getByRole("button", { name: en.backup.chooseFile }),
  );
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(logFailure).mockClear();
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

describe("Restore a backup (#118)", () => {
  it("asks first, then restores and names the safety backup", async () => {
    const text = await backupText();
    restoreBackup.mockResolvedValue({ safetyBackup: "safety.json" });
    await pick(text);

    expect(screen.getByText(en.backup.restoreFrom("backup.json"))).toBeTruthy();
    expect(screen.getByText(en.backup.restoreWarning)).toBeTruthy();
    expect(restoreBackup).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.restoreNow }),
    );

    expect(restoreBackup).toHaveBeenCalledTimes(1);
    expect(restoreBackup.mock.calls[0]?.[0]).toEqual(JSON.parse(text));
    expect(
      await screen.findByText(en.backup.restored("safety.json")),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    ).toBeTruthy();
    expect(screen.queryByText(en.backup.errorTitle)).toBeNull();
  });

  it("Cancel leaves the data alone", async () => {
    await pick(await backupText());

    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );

    expect(restoreBackup).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    ).toBeTruthy();
    expect(screen.queryByText(en.backup.restoreWarning)).toBeNull();
    expect(screen.queryByText(en.backup.errorTitle)).toBeNull();
  });

  it("a file over the size limit is refused with the limit", async () => {
    vi.mocked(invoke).mockRejectedValue("BACKUP_TOO_LARGE");
    render(<BackupRestorePanel />);

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );

    expect(
      await screen.findByText(
        "The file is larger than 20 MB, so it is not a backup of this app.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(logFailure).not.toHaveBeenCalled();
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it("a backup with an unreadable row is refused and lists the record", async () => {
    await pick(
      await backupText(
        "UPDATE leases SET monthly_rent = 'abc' WHERE id = 'l-javorova'",
      ),
    );

    expect(await screen.findByText(en.backup.errRowsInvalid)).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("leases")).toBeTruthy();
    expect(within(table).getByText("l-javorova")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: en.backup.restoreNow }),
    ).toBeNull();
    expect(restoreBackup).not.toHaveBeenCalled();
  });
});
