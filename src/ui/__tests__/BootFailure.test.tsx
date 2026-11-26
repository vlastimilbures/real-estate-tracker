// @vitest-environment jsdom
//
// The startup error screen (UX-057, DR-086; #115, ADR 0153). Each code gets an honest
// message, the right heading for its details, and only the actions that can help:
// Try again for transient failures, Show data folder for every one.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { en } from "../../i18n/en";
import { getDict } from "../../i18n";
import type { DataErrorCode, UpgradeStop } from "../../data/errors";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
const revealDataDir = vi.fn(async () => {});
vi.mock("../../state/platform", async (actual) => ({
  ...(await actual<typeof import("../../state/platform")>()),
  revealDataDir: () => revealDataDir(),
}));

const init = vi.fn(async () => {});

function fail(
  code: DataErrorCode | null,
  details: string[] = [],
  upgrade?: UpgradeStop,
) {
  act(() => {
    usePortfolioStore.setState({
      status: {
        kind: "startupFailed",
        error: { kind: "other", message: "disk I/O error" },
        startup: code ? { code, details, ...(upgrade && { upgrade }) } : null,
      },
      init,
    } as never);
  });
}

const alert = () => screen.getByRole("alert");
const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  init.mockClear();
  revealDataDir.mockReset();
});

describe("startup error screen (UX-057)", () => {
  it("an untyped failure: message, retry hint, Try again, data folder", () => {
    fail(null);
    render(<App />);
    expect(alert().textContent).toContain("disk I/O error");
    expect(alert().textContent).toContain(en.app.bootRetryHint);
    expect(alert().textContent).toContain(en.dataErrors.logHint);
    expect(button(en.app.tryAgain)).not.toBeNull();
    expect(button(en.boot.showDataFolder)).not.toBeNull();
  });

  it("Try again re-runs the startup", async () => {
    fail(null);
    render(<App />);
    const before = init.mock.calls.length;
    await userEvent.click(
      screen.getByRole("button", { name: en.app.tryAgain }),
    );
    expect(init.mock.calls.length).toBe(before + 1);
  });

  it.each(["en", "cs", "ru"] as const)(
    "%s: every move-aside step names the -wal and -shm files too",
    (lang) => {
      // A stale write-ahead log left next to a swapped-in database file can damage it.
      const d = getDict(lang);
      for (const step of [d.boot.nextIntegrity, d.boot.copyAt("x.sqlite")]) {
        expect(step).toContain("portfolio.db-wal");
        expect(step).toContain("portfolio.db-shm");
      }
    },
  );

  it("the retry hint no longer claims nothing changed on disk (#115)", () => {
    expect(en.app.bootRetryHint).not.toMatch(/nothing/i);
  });
});

describe("per-code screen (#115)", () => {
  it("DB_INTEGRITY: the move-aside steps, details, no Try again", () => {
    fail("DB_INTEGRITY", ["row 3 missing from index x"]);
    render(<App />);
    expect(alert().textContent).toContain(en.dataErrors.DB_INTEGRITY);
    expect(alert().textContent).toContain(en.boot.nextIntegrity);
    expect(alert().textContent).toContain(en.boot.detailsOther);
    expect(alert().textContent).not.toContain(en.dataErrors.detailsHeading);
    expect(alert().textContent).not.toContain(en.app.bootRetryHint);
    expect(button(en.app.tryAgain)).toBeNull();
    expect(button(en.boot.showDataFolder)).not.toBeNull();
  });

  it("DB_NEWER: the versions are details, not records; no Try again", () => {
    fail("DB_NEWER", ["database v11, this app v10"]);
    render(<App />);
    expect(alert().textContent).toContain(en.dataErrors.DB_NEWER);
    expect(alert().textContent).toContain(en.boot.detailsOther);
    expect(alert().textContent).not.toContain(en.dataErrors.detailsHeading);
    expect(button(en.app.tryAgain)).toBeNull();
  });

  it("DB_TOO_OLD: the message and the data folder, no Try again (ADR 0230)", () => {
    fail("DB_TOO_OLD");
    render(<App />);
    expect(alert().textContent).toContain(
      "This database was last opened with a version older than 1.4.0. Open it once with version 1.5.0, then update.",
    );
    expect(alert().textContent).not.toContain(en.app.bootRetryHint);
    expect(button(en.app.tryAgain)).toBeNull();
    // Owner decision 2026-11-25: no restore, the old file is never touched.
    expect(button(en.boot.restoreBackup)).toBeNull();
    expect(button(en.boot.showDataFolder)).not.toBeNull();
  });

  it("MIGRATION_FAILED while setting up a new database: no previous version, no copy", () => {
    fail("MIGRATION_FAILED", ["disk I/O error"], {
      from: 0,
      reached: 4,
      stoppedAt: 5,
      backupPath: null,
    });
    render(<App />);
    expect(alert().textContent).toContain(en.boot.partialNew(4, 5));
    expect(alert().textContent).not.toContain(en.boot.partialFailed(4, 5));
    expect(alert().textContent).toContain(en.boot.detailsOther);
    expect(button(en.app.tryAgain)).not.toBeNull();
  });

  it("MIGRATION_FAILED with nothing changed keeps its message and Try again", () => {
    fail("MIGRATION_FAILED", ["disk I/O error"], {
      from: 8,
      reached: 8,
      stoppedAt: 9,
      backupPath: "/a/backups/x.sqlite",
    });
    render(<App />);
    expect(alert().textContent).toContain(en.dataErrors.MIGRATION_FAILED);
    expect(alert().textContent).toContain(en.app.bootRetryHint);
    expect(button(en.app.tryAgain)).not.toBeNull();
  });

  it("MIGRATION_BACKUP_FAILED: free disk space and Try again", () => {
    fail("MIGRATION_BACKUP_FAILED", ["BACKUP_FAILED: disk full"]);
    render(<App />);
    expect(alert().textContent).toContain(
      en.dataErrors.MIGRATION_BACKUP_FAILED,
    );
    expect(alert().textContent).toContain(en.boot.detailsOther);
    expect(button(en.app.tryAgain)).not.toBeNull();
  });

  it("ROW_INVALID: records involved and the next step; no Try again", () => {
    fail("ROW_INVALID", ["leases l1: monthly_rent is not a finite decimal"]);
    render(<App />);
    expect(alert().textContent).toContain(en.dataErrors.ROW_INVALID);
    expect(alert().textContent).toContain(en.boot.nextRowInvalid);
    expect(alert().textContent).toContain(en.dataErrors.detailsHeading);
    expect(button(en.app.tryAgain)).toBeNull();
  });

  it("Show data folder asks Finder; a failure shows where the folder is", async () => {
    fail("DB_INTEGRITY");
    render(<App />);
    revealDataDir.mockRejectedValueOnce(new Error("no folder"));
    await userEvent.click(
      screen.getByRole("button", { name: en.boot.showDataFolder }),
    );
    expect(revealDataDir).toHaveBeenCalledOnce();
    expect(alert().textContent).toContain(en.boot.revealFailed);
  });

  it("a failed Show data folder is forgotten when the next one works", async () => {
    fail("DB_INTEGRITY");
    render(<App />);
    revealDataDir.mockRejectedValueOnce(new Error("no folder"));
    const show = screen.getByRole("button", { name: en.boot.showDataFolder });
    await userEvent.click(show);
    expect(alert().textContent).toContain(en.boot.revealFailed);
    await userEvent.click(show);
    expect(revealDataDir).toHaveBeenCalledTimes(2);
    expect(alert().textContent).not.toContain(en.boot.revealFailed);
  });
});

describe("a save whose read-back failed (ADR 0228)", () => {
  function readBackFailed() {
    act(() => {
      usePortfolioStore.setState({
        status: { kind: "readBackFailed", refused: [] },
        error: null,
        init,
      } as never);
    });
  }

  it("says the change was saved, and offers Try again and the data folder", async () => {
    readBackFailed();
    render(<App />);
    expect(alert().textContent).toContain(en.boot.readBackFailed);
    expect(
      screen.getByRole("heading", { name: en.app.dbErrorEyebrow }),
    ).toBeDefined();
    expect(button(en.boot.showDataFolder)).not.toBeNull();
    expect(button(en.boot.restoreBackup)).toBeNull();
    const before = init.mock.calls.length;
    await userEvent.click(
      screen.getByRole("button", { name: en.app.tryAgain }),
    );
    expect(init.mock.calls.length).toBe(before + 1);
  });

  it.each([
    {
      kind: "restored" as const,
      text: (file: string) => en.backup.restored(file),
    },
    {
      kind: "sampleCleared" as const,
      text: (file: string) => en.sample.cleared(file),
    },
  ])("after $kind, still names the safety copy (#136)", ({ kind, text }) => {
    const file = "portfolio-before-x-20261001T120000Z.json";
    act(() => useUiStore.getState().setNotice({ kind, file }));
    readBackFailed();
    render(<App />);
    expect(alert().textContent).toContain(en.boot.readBackFailed);
    expect(alert().textContent).toContain(text(file));
  });
});
