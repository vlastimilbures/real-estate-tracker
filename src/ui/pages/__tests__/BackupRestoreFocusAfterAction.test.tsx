// @vitest-environment jsdom
//
// ADR 0248 §1–§3 (#549): Settings → Backup disables Export backup, Restore and Load sample
// while each runs, which drops focus to <body>. Export gets focus back after any outcome;
// a failed restore puts it on the confirm's Cancel and a successful one on Choose file;
// Load sample gets it back after a failure and moves it to the sample panel heading after
// a success. Focus the user moved stays where it is.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { BackupRestorePanel } from "../BackupRestore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import type { SaveOutcome } from "../../../platform/saveFileTypes";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { exportToJson } from "../../../data/backup";
import { deferred, type Deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

let exported: Deferred<SaveOutcome>;
let restored: Deferred<{ safetyBackup: string }>;
let loaded: Deferred<void>;

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  exported = deferred();
  restored = deferred();
  loaded = deferred();
  act(() => {
    usePortfolioStore.setState({
      status: "ready",
      portfolio,
      assumptions,
      sample: { active: false, dismissed: false },
      replacing: 0,
      exportBackup: () => exported.promise,
      restoreBackup: () => restored.promise,
      loadSample: () => loaded.promise,
    } as never);
  });
});

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const either = (a: string, b: string) => new RegExp(`^(${a}|${b})$`);
const exportButton = () =>
  button(either(en.backup.exportButton, en.backup.exporting));
const restoreButton = () =>
  button(either(en.backup.restoreNow, en.backup.restoring));
const loadButton = () =>
  button(either(en.sample.loadAction, en.sample.loading));

function renderPanel() {
  render(
    <>
      <BackupRestorePanel />
      <button type="button">Elsewhere</button>
    </>,
  );
}

/** Press `target`, check it disabled, and fire the focus fixup now. */
async function press(target: () => HTMLElement) {
  await userEvent.click(target());
  expect(target()).toHaveProperty("disabled", true);
  act(() => target().blur());
  expect(document.activeElement).toBe(document.body);
}

/** The sample as a backup file. */
async function backupText(): Promise<string> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  const backup = await exportToJson(sql, new Date());
  sql.db.close();
  return JSON.stringify(backup);
}

async function pickBackup() {
  vi.mocked(invoke).mockResolvedValue({
    name: "backup.json",
    text: await backupText(),
  });
  renderPanel();
  await userEvent.click(button(en.backup.chooseFile));
  await screen.findByText(en.backup.restoreWarning);
}

describe("Export backup: focus after any outcome (ADR 0248 §2)", () => {
  const outcomes: [string, (d: Deferred<SaveOutcome>) => void][] = [
    ["saved", (d) => d.resolve({ kind: "saved", filename: "b.json" })],
    ["cancelled", (d) => d.resolve({ kind: "cancelled" })],
    ["refused", (d) => d.reject(new Error("disk full"))],
  ];
  for (const [outcome, settle] of outcomes)
    it.fails(
      `puts focus back on Export when the export is ${outcome} (#549)`,
      async () => {
        renderPanel();
        await press(exportButton);
        await act(async () => settle(exported));
        expect(exportButton()).toHaveProperty("disabled", false);
        expect(document.activeElement).toBe(exportButton());
      },
    );

  it("leaves focus where the user moved it during the export", async () => {
    renderPanel();
    await userEvent.click(exportButton());
    const elsewhere = button("Elsewhere");
    act(() => elsewhere.focus());
    await act(async () => exported.resolve({ kind: "cancelled" }));
    expect(exportButton()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("Restore: focus after the outcome (ADR 0248 §1, §3)", () => {
  it.fails(
    "a failed restore puts focus on the confirm's Cancel (#549)",
    async () => {
      await pickBackup();
      await press(restoreButton);
      await act(async () => restored.reject(new Error("disk full")));
      expect(restoreButton()).toHaveProperty("disabled", false);
      expect(document.activeElement).toBe(button(en.common.cancel));
    },
  );

  it.fails(
    "a successful restore puts focus on Choose file (#549)",
    async () => {
      await pickBackup();
      await press(restoreButton);
      await act(async () => restored.resolve({ safetyBackup: "safety.json" }));
      expect(document.activeElement).toBe(button(en.backup.chooseFile));
    },
  );
});

describe("Load sample: focus after the outcome (ADR 0248 §2–§3)", () => {
  beforeEach(() =>
    act(() =>
      usePortfolioStore.setState({
        portfolio: { ...portfolio, properties: [] },
      }),
    ),
  );

  it.fails("a failure puts focus back on Load sample (#549)", async () => {
    renderPanel();
    await press(loadButton);
    await act(async () => loaded.reject(new Error("disk full")));
    expect(loadButton()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(loadButton());
  });

  it.fails(
    "a success puts focus on the sample panel heading (#549)",
    async () => {
      renderPanel();
      await press(loadButton);
      await act(async () => {
        usePortfolioStore.setState({
          portfolio,
          sample: { active: true, dismissed: false },
        });
        loaded.resolve();
      });
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: en.sample.panelTitle }),
      );
    },
  );
});
