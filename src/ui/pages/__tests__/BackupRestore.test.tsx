// @vitest-environment jsdom
//
// #118 (R7-06): the restore flow on Settings → Backup. A picked backup asks for
// confirmation; Cancel leaves the data alone, Restore replaces it and names the safety
// backup; a refused file shows why.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { BackupRestorePanel } from "../BackupRestore";
import { OutcomeRegions } from "../../components/OutcomeRegions";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { logFailure } from "../../../state/diagnostics";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import {
  BACKUP_MAX_BYTES,
  exportToJson,
  SafetyBackupError,
} from "../../../data/backup";

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

/** The panel with the app shell's outcome regions, where its toasts and notices show. */
function renderPanel() {
  return render(
    <>
      <BackupRestorePanel />
      <OutcomeRegions />
    </>,
  );
}

/** Render the panel and pick a backup file holding `text`. */
async function pick(text: string) {
  vi.mocked(invoke).mockResolvedValue({ name: "backup.json", text });
  renderPanel();
  await userEvent.click(
    screen.getByRole("button", { name: en.backup.chooseFile }),
  );
  expect(invoke).toHaveBeenCalledWith("open_backup_file", {
    maxBytes: BACKUP_MAX_BYTES,
  });
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
    useUiStore.setState({ notice: null, toast: null, lastImport: null });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Restore a backup (#118)", () => {
  it("asks first, then restores and names the safety backup", async () => {
    const text = await backupText();
    restoreBackup.mockResolvedValue({ safetyBackup: "safety.json" });
    await pick(text);

    expect(
      await screen.findByText(en.backup.restoreFrom("backup.json")),
    ).toBeTruthy();
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
    await screen.findByText(en.backup.restoreWarning);

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
    renderPanel();

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
  it("a safety backup that cannot be saved stops the restore and says so", async () => {
    restoreBackup.mockRejectedValue(new SafetyBackupError("disk full"));
    await pick(await backupText());

    await userEvent.click(
      await screen.findByRole("button", { name: en.backup.restoreNow }),
    );

    expect(
      await screen.findByText(en.backup.safetyBackupFailed("disk full")),
    ).toBeTruthy();
    expect(vi.mocked(logFailure).mock.calls[0]?.[0]).toBe("RESTORE");
  });

  it("a failed restore says the data is unchanged and logs it", async () => {
    restoreBackup.mockRejectedValue(new Error("database is locked"));
    await pick(await backupText());

    await userEvent.click(
      await screen.findByRole("button", { name: en.backup.restoreNow }),
    );

    expect(
      await screen.findByText(
        /^The restore failed and was rolled back — your current data is unchanged\./,
      ),
    ).toBeTruthy();
    expect(vi.mocked(logFailure).mock.calls[0]?.[0]).toBe("RESTORE");
  });

  it("the safety backup name stays until dismissed (#136)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    restoreBackup.mockResolvedValue({ safetyBackup: "safety.json" });
    vi.mocked(invoke).mockResolvedValue({
      name: "backup.json",
      text: await backupText(),
    });
    renderPanel();
    await user.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );
    await user.click(
      await screen.findByRole("button", { name: en.backup.restoreNow }),
    );
    await screen.findByText(en.backup.restored("safety.json"));

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText(en.backup.restored("safety.json"))).toBeTruthy();

    await user.click(screen.getByRole("button", { name: en.common.dismiss }));
    expect(screen.queryByText(en.backup.restored("safety.json"))).toBeNull();
  });

  it("a restore clears the last import report (#136)", async () => {
    restoreBackup.mockResolvedValue({ safetyBackup: "safety.json" });
    act(() => useUiStore.setState({ lastImport: { items: [] } as never }));
    await pick(await backupText());
    await userEvent.click(
      await screen.findByRole("button", { name: en.backup.restoreNow }),
    );
    await screen.findByText(en.backup.restored("safety.json"));
    expect(useUiStore.getState().lastImport).toBeNull();
  });

  it("the other buttons wait while a restore runs (#136)", async () => {
    let finish: (v: { safetyBackup: string }) => void = () => {};
    restoreBackup.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    act(() =>
      usePortfolioStore.setState({
        sample: { active: true, dismissed: false },
      }),
    );
    await pick(await backupText());
    await userEvent.click(
      await screen.findByRole("button", { name: en.backup.restoreNow }),
    );

    const exportButton = screen.getByRole<HTMLButtonElement>("button", {
      name: en.backup.exportButton,
    });
    const clearButton = screen.getByRole<HTMLButtonElement>("button", {
      name: en.sample.clearAction,
    });
    expect(exportButton.disabled).toBe(true);
    expect(clearButton.disabled).toBe(true);

    await act(async () => finish({ safetyBackup: "safety.json" }));
    expect(exportButton.disabled).toBe(false);
    expect(clearButton.disabled).toBe(false);
  });
});
