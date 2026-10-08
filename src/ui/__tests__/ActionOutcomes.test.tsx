// @vitest-environment jsdom
//
// #136 (ADR 0154): the outcome of a whole-database action follows the owner. Leaving
// Settings → Backup while a restore runs still shows its result, success or failure,
// on the page the owner moved to.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { Dashboard } from "../pages/Dashboard";
import { SettingsPage } from "../pages/Settings";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { RestoreError } from "../../state/backup";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { en } from "../../i18n/en";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));
vi.mock("../../lib/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/day")>()),
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
  localIsoDay: () => "2026-10-01",
}));

/** Settings and the Dashboard, switched by the route like the app's page switch. */
function Pages() {
  const route = useUiStore((s) => s.route);
  return route === "settings" ? <SettingsPage /> : <Dashboard />;
}

let settle: { resolve: (v: unknown) => void; reject: (e: unknown) => void };

beforeEach(async () => {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  const text = JSON.stringify(await exportToJson(sql, new Date()));
  sql.db.close();
  vi.mocked(invoke).mockResolvedValue({ name: "backup.json", text });
  const restoreBackup = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        settle = { resolve, reject };
      }),
  );
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "settings",
      settingsTab: "backup",
      notice: null,
      toast: null,
      unsavedSources: [],
      unsavedChanges: false,
      pendingLeave: null,
    });
    usePortfolioStore.setState({
      status: "ready",
      portfolio,
      assumptions,
      scenarios: [],
      sample: { active: false, dismissed: false },
      backup: { lastAt: null, lastFile: null, changedSince: false },
      restoreBackup,
    } as never);
  });
});

/** Confirm a restore on Settings → Backup, then go to the Dashboard while it runs. */
async function restoreThenLeave() {
  render(<Pages />);
  await userEvent.click(
    screen.getByRole("button", { name: en.backup.chooseFile }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: en.backup.restoreNow }),
  );
  act(() => useUiStore.getState().navigate("dashboard"));
  expect(
    screen.getByText(en.dashboard.title, { selector: ".page-title" }),
  ).toBeTruthy();
}

describe("leaving the page while a restore runs (#136)", () => {
  it("the Dashboard names the safety backup when it succeeds", async () => {
    await restoreThenLeave();
    await act(async () => settle.resolve({ safetyBackup: "safety.json" }));
    expect(screen.getByText(en.backup.restored("safety.json"))).toBeTruthy();
  });

  it("the Dashboard shows why when it fails", async () => {
    await restoreThenLeave();
    await act(async () =>
      settle.reject(
        new RestoreError("BACKUP_ROWS_INVALID", "rows", {
          issues: [{ table: "leases", id: "l-1", rule: "UNREADABLE_VALUE" }],
        }),
      ),
    );
    expect(screen.getByText(en.backup.errRowsInvalid)).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("l-1")).toBeTruthy();
  });
});
