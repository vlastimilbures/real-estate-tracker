// @vitest-environment jsdom
//
// ADR 0147 (#122): Settings → Backup logs each failure under the action that failed, and
// a backup file that cannot be read says so instead of calling it an invalid backup.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { BackupRestorePanel } from "../BackupRestore";
import { OutcomeRegions } from "../../components/OutcomeRegions";
import { portfolioDb, usePortfolioStore } from "../../../state/portfolioStore";
import { logFailure } from "../../../state/diagnostics";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

const loadSample = vi.fn();

beforeEach(() => {
  vi.mocked(logFailure).mockClear();
  vi.mocked(invoke).mockReset();
  loadSample.mockReset();
  act(() => {
    usePortfolioStore.setState({
      status: { kind: "ready" },
      portfolio: { ...portfolio, properties: [] },
      assumptions,
      sample: { active: false, dismissed: false },
      loadSample,
    } as never);
  });
});

describe("Backup & Restore failures (ADR 0147)", () => {
  it("a failed sample load is logged as SAMPLE (#122)", async () => {
    const e = new Error("disk full");
    // The real store on an empty database, whose write fails with `e`: the store logs
    // the failure where it catches it (ADR 0147, #467).
    const sql = openMemorySql();
    await migrate(sql);
    portfolioDb.set({ ...sql, transaction: () => Promise.reject(e) });
    act(() =>
      usePortfolioStore.setState({
        loadSample: usePortfolioStore.getInitialState().loadSample,
      }),
    );
    render(
      <>
        <BackupRestorePanel />
        <OutcomeRegions />
      </>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: en.sample.loadAction }),
    );

    await waitFor(() => expect(logFailure).toHaveBeenCalled());
    expect(logFailure).toHaveBeenCalledWith("SAMPLE", e);
  });

  it("a failed restore pick is logged as RESTORE (#122)", async () => {
    vi.mocked(invoke).mockRejectedValue("Operation not permitted (os error 1)");
    render(
      <>
        <BackupRestorePanel />
        <OutcomeRegions />
      </>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );

    await waitFor(() => expect(logFailure).toHaveBeenCalled());
    expect(vi.mocked(logFailure).mock.calls[0]?.[0]).toBe("RESTORE");
  });

  it("a backup file that cannot be read says so (#122)", async () => {
    vi.mocked(invoke).mockRejectedValue("Operation not permitted (os error 1)");
    render(
      <>
        <BackupRestorePanel />
        <OutcomeRegions />
      </>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );

    await waitFor(() => expect(logFailure).toHaveBeenCalled());
    expect(
      screen.getByText(
        "The file could not be read. Check that the disk is connected and the file is downloaded. (Operation not permitted (os error 1))",
      ),
    ).toBeTruthy();
  });
});
