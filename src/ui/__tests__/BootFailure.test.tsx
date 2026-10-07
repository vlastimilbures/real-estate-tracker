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
      status: "error",
      error: { kind: "other", message: "disk I/O error" },
      startupError: code
        ? { code, details, ...(upgrade && { upgrade }) }
        : null,
      init,
    } as never);
  });
}

const alert = () => screen.getByRole("alert");
const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  init.mockClear();
  revealDataDir.mockReset();
  act(() => useUiStore.setState({ language: "en" }));
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

  it("MIGRATION_CONFLICT at the first step: nothing changed, records involved", () => {
    fail("MIGRATION_CONFLICT", ['properties "A", "A": duplicate name'], {
      from: 6,
      reached: 6,
      stoppedAt: 7,
      backupPath: null,
    });
    render(<App />);
    expect(alert().textContent).toContain(en.dataErrors.MIGRATION_CONFLICT);
    expect(alert().textContent).toContain(en.dataErrors.detailsHeading);
    expect(button(en.app.tryAgain)).toBeNull();
  });

  it("MIGRATION_CONFLICT after a committed step: the version reached and the copy", () => {
    fail("MIGRATION_CONFLICT", ['scenario "S": overrides …'], {
      from: 6,
      reached: 7,
      stoppedAt: 8,
      backupPath: "/a/backups/pre-migration-v6-to-v10-20261001T073512Z.sqlite",
    });
    render(<App />);
    const text = alert().textContent;
    expect(text).toContain(en.boot.partialConflict(7, 8));
    expect(text).toContain(
      en.boot.copyAt("pre-migration-v6-to-v10-20261001T073512Z.sqlite"),
    );
    expect(text).not.toContain(en.dataErrors.MIGRATION_CONFLICT);
    expect(text).not.toMatch(/nothing was changed/i);
  });

  it("MIGRATION_FAILED after a committed step of a new database: no copy was needed", () => {
    fail("MIGRATION_FAILED", ["disk I/O error"], {
      from: 0,
      reached: 4,
      stoppedAt: 5,
      backupPath: null,
    });
    render(<App />);
    expect(alert().textContent).toContain(en.boot.partialFailed(4, 5));
    expect(alert().textContent).toContain(en.boot.copyMissing);
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
});
