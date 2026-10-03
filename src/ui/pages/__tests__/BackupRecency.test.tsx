// @vitest-environment jsdom
//
// ADR 0110: Settings → Backup says when the last backup was exported; the sidebar shows a
// quiet reminder when the data changed and there is no backup or it is over 30 days old.
// The reminder opens Settings → Backup and can be hidden for the session.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../Dashboard";
import { SettingsPage as Settings } from "../Settings";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import type { BackupState } from "../../../state/backup";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

const NOW = new Date(2026, 9, 3, 12, 0); // 03.10.2026 local

function setBackup(backup: BackupState) {
  act(() => usePortfolioStore.setState({ backup }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "dashboard",
      settingsTab: "backup",
      backupHintDismissed: false,
      sidebarCollapsed: false,
      unsavedSources: [],
      unsavedChanges: false,
    });
    usePortfolioStore.setState({
      status: "ready",
      portfolio,
      assumptions,
      scenarios: [],
      sample: { active: false, dismissed: false },
      backup: { lastAt: null, lastFile: null, changedSince: false },
    });
  });
});

afterEach(() => vi.useRealTimers());

const hint = () => screen.queryByRole("button", { name: /export now/i });

describe("Settings → Backup: last backup (ADR 0110)", () => {
  it("says no backup was exported yet, and to keep a copy elsewhere", () => {
    render(<Settings />);
    expect(screen.getByText(en.backup.noBackupYet)).toBeTruthy();
    expect(screen.getByText(en.backup.offDevice)).toBeTruthy();
  });

  it("shows the date and how long ago", () => {
    setBackup({
      lastAt: new Date(2026, 8, 12, 9, 0).toISOString(),
      lastFile: "portfolio-backup-2026-09-12.json",
      changedSince: false,
    });
    render(<Settings />);
    expect(
      screen.getByText("Last backup: 12.09.2026 (3 weeks ago)"),
    ).toBeTruthy();
  });
});

describe("sidebar backup reminder (ADR 0110)", () => {
  it("is hidden while nothing changed (a fresh sample install)", () => {
    render(<Dashboard />);
    expect(hint()).toBeNull();
  });

  it("is hidden for a recent backup", () => {
    setBackup({
      lastAt: new Date(2026, 8, 20).toISOString(),
      lastFile: "a.json",
      changedSince: true,
    });
    render(<Dashboard />);
    expect(hint()).toBeNull();
  });

  it("shows when data changed and there is no backup, and opens Settings → Backup", async () => {
    setBackup({ lastAt: null, lastFile: null, changedSince: true });
    act(() => useUiStore.setState({ settingsTab: "assumptions" }));
    render(<Dashboard />);
    vi.useRealTimers();
    await userEvent.click(
      screen.getByRole("button", { name: en.shell.backupHintNone }),
    );
    expect(useUiStore.getState().route).toBe("settings");
    expect(useUiStore.getState().settingsTab).toBe("backup");
  });

  it("names the age of an old backup", () => {
    setBackup({
      lastAt: new Date(2026, 7, 19).toISOString(),
      lastFile: "a.json",
      changedSince: true,
    });
    render(<Dashboard />);
    expect(
      screen.getByRole("button", { name: en.shell.backupHintOld(45) }),
    ).toBeTruthy();
  });

  it("can be hidden for the session", async () => {
    setBackup({ lastAt: null, lastFile: null, changedSince: true });
    render(<Dashboard />);
    vi.useRealTimers();
    await userEvent.click(
      screen.getByRole("button", { name: en.shell.dismissBackupHint }),
    );
    expect(hint()).toBeNull();
    expect(useUiStore.getState().backupHintDismissed).toBe(true);
  });

  it("is one labelled icon button in the collapsed sidebar", () => {
    setBackup({ lastAt: null, lastFile: null, changedSince: true });
    act(() => useUiStore.setState({ sidebarCollapsed: true }));
    render(<Dashboard />);
    expect(
      screen.getByRole("button", { name: en.shell.backupHintNone }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: en.shell.dismissBackupHint }),
    ).toBeNull();
  });
});
