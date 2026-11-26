// @vitest-environment jsdom
//
// ADR 0154: a restore or Clear sample over a notice already showing replaces its text
// in place. The banner is one live region (role="status"), and it stays the same
// element: removing it and adding a new one with its text already in it is announced
// unreliably. With the real store, so its drop and the new notice land in one commit.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { BackupRestorePanel } from "../pages/BackupRestore";
import { ClearSampleButton } from "../components/ClearSampleDialog";
import { OutcomeRegions } from "../components/OutcomeRegions";
import { portfolioDb, usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { toActionError } from "../../state/actionError";
import type { CsvImportReport } from "../../state/csv";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";
import { en } from "../../i18n/en";

vi.mock("../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

const ui = () => useUiStore.getState();
const OLD = "old-safety.json";

/** The real store on the seeded sample, with what the old data left showing. */
async function start() {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  portfolioDb.set(null);
  usePortfolioStore.setState(usePortfolioStore.getInitialState(), true);
  await usePortfolioStore.getState().init(async () => sql);
  act(() =>
    useUiStore.setState({
      route: "settings",
      settingsTab: "backup",
      unsavedSources: [],
      pendingLeave: null,
      notice: { kind: "restored", file: OLD },
      failure: { action: "import", error: toActionError(new Error("x")) },
      lastImport: { items: [] } as unknown as CsvImportReport,
    }),
  );
  return sql;
}

/** The notice banner showing now. */
const banner = () => screen.getByRole("status");

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe("a replacing action over a notice already showing (ADR 0154)", () => {
  it("a restore changes the banner's text in place", async () => {
    const sql = await start();
    const text = JSON.stringify(await exportToJson(sql, new Date()));
    render(
      <>
        <BackupRestorePanel />
        <OutcomeRegions />
      </>,
    );
    const before = banner();
    expect(before.textContent).toContain(en.backup.restored(OLD));
    vi.mocked(invoke).mockResolvedValue({ name: "backup.json", text });
    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );
    vi.mocked(invoke).mockResolvedValue(undefined);
    await userEvent.click(
      await screen.findByRole("button", { name: en.backup.restoreNow }),
    );
    await waitFor(() => expect(ui().notice?.file).not.toBe(OLD));
    expect(ui().notice?.kind).toBe("restored");
    expect(banner()).toBe(before);
    expect(before.textContent).toContain(en.backup.restored(ui().notice!.file));
    expect(ui().failure).toBeNull();
    expect(ui().lastImport).toBeNull();
  });

  it("Clear sample drops them, then names its own safety copy, in the same banner", async () => {
    await start();
    render(
      <>
        <ClearSampleButton />
        <OutcomeRegions />
      </>,
    );
    const before = banner();
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.clearAction }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.confirm }),
    );
    await waitFor(() => expect(ui().notice?.kind).toBe("sampleCleared"));
    expect(ui().notice?.file).not.toBe(OLD);
    expect(banner()).toBe(before);
    expect(before.textContent).toContain(en.sample.cleared(ui().notice!.file));
    expect(ui().failure).toBeNull();
    expect(ui().lastImport).toBeNull();
    expect(ui().route).toBe("dashboard");
  });
});
