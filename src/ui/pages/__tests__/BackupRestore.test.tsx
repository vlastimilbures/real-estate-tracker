// @vitest-environment jsdom
//
// Settings → Backup (`BackupRestorePanel`), one describe per behaviour:
// - restoring a backup: confirm, outcome and refusals (#118, R7-06; #136);
// - the backup's date on the confirm step (ADR 0149);
// - values the forms refuse (ADR 0148, ADR 0232);
// - failures logged under the action that failed (ADR 0147);
// - focus after an action (ADR 0248);
// - Show data folder (ADR 0175).
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { BackupRestorePanel } from "../BackupRestore";
import { OutcomeRegions, ToastRegion } from "../../components/OutcomeRegions";
import { portfolioDb, usePortfolioStore } from "../../../state/portfolioStore";
import type { Sql } from "../../../data/sql";
import type { SaveOutcome } from "../../../platform/saveFileTypes";
import { logFailure } from "../../../state/diagnostics";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { BACKUP_MAX_BYTES, exportToJson } from "../../../data/backup";
import { deferred, type Deferred } from "../../../__tests__/support/deferred";
import { failure, success } from "../../../__tests__/support/result";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

const revealDataDir = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../../state/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/platform")>()),
  revealDataDir,
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

/** The panel, with the app shell's outcome regions (where its notices show) and toast
 *  region unless left out, and a button outside it when `elsewhere`. */
function renderPanel({
  outcomes = true,
  toasts = true,
  elsewhere = false,
} = {}) {
  return render(
    <>
      <BackupRestorePanel />
      {outcomes && <OutcomeRegions />}
      {toasts && <ToastRegion />}
      {elsewhere && <button type="button">Elsewhere</button>}
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
  revealDataDir.mockReset();
  act(() => {
    usePortfolioStore.setState({
      status: { kind: "ready" },
      portfolio,
      assumptions,
      sample: { active: false, dismissed: false },
      restoreBackup,
      replacing: 0,
    } as never);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** The store's own restore, on the seed as `wrap` returns it: the store logs a failure
 *  where it catches it (ADR 0147, #467). */
async function realRestore(wrap: (sql: Sql) => Sql = (sql) => sql) {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  portfolioDb.set(wrap(sql));
  act(() =>
    usePortfolioStore.setState({
      restoreBackup: usePortfolioStore.getInitialState().restoreBackup,
    }),
  );
}

// #118 (R7-06): a picked backup asks for confirmation; Cancel leaves the data alone,
// Restore replaces it and names the safety backup; a refused file shows why. #136: the
// safety backup notice stays, and the other buttons wait while a restore runs.
describe("Restore a backup", () => {
  it("asks first, then restores and names the safety backup", async () => {
    const text = await backupText();
    restoreBackup.mockResolvedValue(success({ safetyBackup: "safety.json" }));
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
    vi.mocked(invoke).mockRejectedValue({
      code: "BACKUP_TOO_LARGE",
      detail: "BACKUP_TOO_LARGE",
    });
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

  it("a failed pick is forgotten when the next pick works, which asks to confirm", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "IO",
      detail: "Operation not permitted (os error 1)",
    });
    await pick(await backupText());
    expect(screen.getByRole("alert")).toBeDefined();
    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: en.backup.restoreNow }),
    ).toBeDefined();
  });

  it("a safety backup that cannot be saved stops the restore and says so", async () => {
    await realRestore();
    await pick(await backupText());
    vi.mocked(invoke).mockImplementation((command: string) =>
      command === "write_app_backup"
        ? Promise.reject(new Error("disk full"))
        : Promise.resolve(),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: en.backup.restoreNow }),
    );

    expect(
      await screen.findByText(en.backup.safetyBackupFailed("disk full")),
    ).toBeTruthy();
    expect(vi.mocked(logFailure).mock.calls[0]?.[0]).toBe("RESTORE");
  });

  it("a failed restore says the data is unchanged and logs it", async () => {
    await realRestore((sql) => ({
      ...sql,
      transaction: () => Promise.reject(new Error("database is locked")),
    }));
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
    restoreBackup.mockResolvedValue(success({ safetyBackup: "safety.json" }));
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

  it("the other buttons wait while a restore runs (#136)", async () => {
    let finish: (v: { safetyBackup: string }) => void = () => {};
    restoreBackup.mockImplementation(() =>
      new Promise((resolve) => {
        finish = resolve;
      }).then(success),
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

  it("the buttons still wait after leaving and coming back mid-restore (#136 review)", () => {
    act(() =>
      usePortfolioStore.setState({
        replacing: 1,
        sample: { active: true, dismissed: false },
      }),
    );
    renderPanel();
    for (const name of [
      en.backup.exportButton,
      en.backup.chooseFile,
      en.sample.clearAction,
    ])
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name }).disabled,
      ).toBe(true);
  });
});

// ADR 0149 (#119): the confirm step dates the backup by the local calendar day of
// `exportedAt`, like its file name and the "Last backup" line. These tests run in Prague
// time whatever zone the suite runs in, so 00:30 local is the previous day in UTC.
describe("Restore: the backup's date", () => {
  const suiteTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Europe/Prague";
  });
  afterAll(() => {
    // Assigning undefined would store the string "undefined" (UTC), not unset it.
    if (suiteTz === undefined) delete process.env.TZ;
    else process.env.TZ = suiteTz;
  });

  it("shows the local day of a backup made at 00:30 (#119)", async () => {
    const exportedAt = new Date(2026, 9, 3, 0, 30); // 03.10.2026 00:30 Prague
    expect(exportedAt.toISOString()).toBe("2026-10-02T22:30:00.000Z");
    const text = JSON.stringify({
      ...JSON.parse(await backupText()),
      exportedAt: exportedAt.toISOString(),
    });
    vi.mocked(invoke).mockResolvedValue({ name: "b.json", text });
    renderPanel({ outcomes: false, toasts: false });

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );

    expect(
      await screen.findByText(en.backup.backupDate("03.10.2026")),
    ).toBeTruthy();
  });
});

// ADR 0148 (#133): a backup whose only problems are values the forms refuse (outside a
// range) is not refused: the confirm step lists them and asks to restore anyway. A stored
// date before 1900 is not one of them (ADR 0232).
describe("Restore: values the forms do not accept", () => {
  /** One mortgage's fixation is 60 years. */
  const FIXATION_60 =
    "UPDATE mortgage_blocks SET fixation_years = 60 WHERE id = (SELECT MIN(id) FROM mortgage_blocks)";

  it("lists the values and asks to restore anyway (#133)", async () => {
    const text = await backupText(FIXATION_60);
    vi.mocked(invoke).mockResolvedValue({ name: "old.json", text });
    restoreBackup.mockResolvedValue(success({ safetyBackup: "safety.json" }));
    renderPanel({ outcomes: false, toasts: false });

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );

    const anyway = await screen.findByRole("button", {
      name: "Restore anyway",
    });
    expect(screen.queryByText(en.backup.errRowsInvalid)).toBeNull();
    expect(
      screen.getByText(
        "This backup holds 1 value the forms do not accept. The app computes with it, and the Data check lists it after the restore. Restore anyway?",
      ),
    ).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("fixation_years")).toBeTruthy();
    expect(within(table).getByText(en.forms.intRange("0", "50"))).toBeTruthy();

    await userEvent.click(anyway);
    expect(restoreBackup).toHaveBeenCalledTimes(1);
  });

  it("a date before 1900 gets the ordinary confirm step (ADR 0232)", async () => {
    const text = await backupText(
      "UPDATE properties SET purchase_date = '1899-12-31' WHERE id = 'javorova'",
    );
    vi.mocked(invoke).mockResolvedValue({ name: "old.json", text });
    restoreBackup.mockResolvedValue(success({ safetyBackup: "safety.json" }));
    renderPanel({ outcomes: false, toasts: false });

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );

    const now = await screen.findByRole("button", { name: "Restore now" });
    expect(
      screen.queryByRole("region", { name: "Values the forms do not accept" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore anyway" })).toBeNull();

    await userEvent.click(now);
    expect(restoreBackup).toHaveBeenCalledTimes(1);
  });
});

// ADR 0147 (#122): Settings → Backup logs each failure under the action that failed, and
// a backup file that cannot be read says so instead of calling it an invalid backup.
describe("Failures are logged under the action that failed", () => {
  const loadSample = vi.fn();
  beforeEach(() => {
    loadSample.mockReset();
    act(() =>
      usePortfolioStore.setState({
        portfolio: { ...portfolio, properties: [] },
        loadSample,
      }),
    );
  });

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
    renderPanel({ toasts: false });

    await userEvent.click(
      screen.getByRole("button", { name: en.sample.loadAction }),
    );

    await waitFor(() => expect(logFailure).toHaveBeenCalled());
    expect(logFailure).toHaveBeenCalledWith("SAMPLE", e);
  });

  it("a failed restore pick is logged as RESTORE (#122)", async () => {
    vi.mocked(invoke).mockRejectedValue({
      code: "IO",
      detail: "Operation not permitted (os error 1)",
    });
    renderPanel({ toasts: false });

    await userEvent.click(
      screen.getByRole("button", { name: en.backup.chooseFile }),
    );

    await waitFor(() => expect(logFailure).toHaveBeenCalled());
    expect(vi.mocked(logFailure).mock.calls[0]?.[0]).toBe("RESTORE");
  });

  it("a backup file that cannot be read says so (#122)", async () => {
    vi.mocked(invoke).mockRejectedValue({
      code: "IO",
      detail: "Operation not permitted (os error 1)",
    });
    renderPanel({ toasts: false });

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

// ADR 0248 §1–§3 (#549): Export backup, Restore and Load sample are disabled while each
// runs, which drops focus to <body>. Export gets focus back after any outcome; a failed
// restore puts it on the confirm's Cancel and a successful one on Choose file; Load sample
// gets it back after a failure and moves it to the sample panel heading after a success.
// Focus the user moved stays where it is.
describe("Focus after an action", () => {
  let exported: Deferred<SaveOutcome>;
  let restored: Deferred<{ safetyBackup: string }>;
  let loaded: Deferred<void>;

  beforeEach(() => {
    exported = deferred();
    restored = deferred();
    loaded = deferred();
    act(() =>
      usePortfolioStore.setState({
        exportBackup: () => exported.promise.then(success, failure),
        restoreBackup: () => restored.promise.then(success, failure),
        loadSample: () => loaded.promise.then(success, failure),
      }),
    );
  });

  const button = (name: string | RegExp) =>
    screen.getByRole("button", { name });
  const either = (a: string, b: string) => new RegExp(`^(${a}|${b})$`);
  const exportButton = () =>
    button(either(en.backup.exportButton, en.backup.exporting));
  const restoreButton = () =>
    button(either(en.backup.restoreNow, en.backup.restoring));
  const loadButton = () =>
    button(either(en.sample.loadAction, en.sample.loading));
  const renderWithElsewhere = () =>
    renderPanel({ outcomes: false, toasts: false, elsewhere: true });

  /** Press `target`, check it disabled, and fire the focus fixup now. */
  async function press(target: () => HTMLElement) {
    await userEvent.click(target());
    expect(target()).toHaveProperty("disabled", true);
    act(() => target().blur());
    expect(document.activeElement).toBe(document.body);
  }

  async function pickBackup() {
    vi.mocked(invoke).mockResolvedValue({
      name: "backup.json",
      text: await backupText(),
    });
    renderWithElsewhere();
    await userEvent.click(button(en.backup.chooseFile));
    await screen.findByText(en.backup.restoreWarning);
  }

  // ADR 0248 §2.
  describe("Export backup: focus after any outcome", () => {
    const outcomes: [string, (d: Deferred<SaveOutcome>) => void][] = [
      ["saved", (d) => d.resolve({ kind: "saved", filename: "b.json" })],
      ["cancelled", (d) => d.resolve({ kind: "cancelled" })],
      ["refused", (d) => d.reject(new Error("disk full"))],
    ];
    for (const [outcome, settle] of outcomes)
      it(`puts focus back on Export when the export is ${outcome} (#549)`, async () => {
        renderWithElsewhere();
        await press(exportButton);
        await act(async () => settle(exported));
        expect(exportButton()).toHaveProperty("disabled", false);
        expect(document.activeElement).toBe(exportButton());
      });

    it("leaves focus where the user moved it during the export", async () => {
      renderWithElsewhere();
      await userEvent.click(exportButton());
      const elsewhere = button("Elsewhere");
      act(() => elsewhere.focus());
      await act(async () => exported.resolve({ kind: "cancelled" }));
      expect(exportButton()).toHaveProperty("disabled", false);
      expect(document.activeElement).toBe(elsewhere);
    });
  });

  // ADR 0248 §1, §3.
  describe("Restore: focus after the outcome", () => {
    it("a failed restore puts focus on the confirm's Cancel (#549)", async () => {
      await pickBackup();
      await press(restoreButton);
      await act(async () => restored.reject(new Error("disk full")));
      expect(restoreButton()).toHaveProperty("disabled", false);
      expect(document.activeElement).toBe(button(en.common.cancel));
    });

    it("a successful restore puts focus on Choose file (#549)", async () => {
      await pickBackup();
      await press(restoreButton);
      await act(async () => restored.resolve({ safetyBackup: "safety.json" }));
      expect(document.activeElement).toBe(button(en.backup.chooseFile));
    });
  });

  // ADR 0248 §2–§3.
  describe("Load sample: focus after the outcome", () => {
    beforeEach(() =>
      act(() =>
        usePortfolioStore.setState({
          portfolio: { ...portfolio, properties: [] },
        }),
      ),
    );

    it("a failure puts focus back on Load sample (#549)", async () => {
      renderWithElsewhere();
      await press(loadButton);
      await act(async () => loaded.reject(new Error("disk full")));
      expect(loadButton()).toHaveProperty("disabled", false);
      expect(document.activeElement).toBe(loadButton());
    });

    it("a success puts focus on the sample panel heading (#549)", async () => {
      renderWithElsewhere();
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
    });
  });
});

// ADR 0175 (#151 item 7): the panel says where the safety backups are and opens the
// data folder; a failure is logged under REVEAL and forgotten when the next one works.
describe("Show data folder", () => {
  it("says where the safety backups are and shows the folder", async () => {
    renderPanel();
    const button = screen.getByRole("button", {
      name: en.boot.showDataFolder,
      description: en.backup.folderHint,
    });
    await userEvent.click(button);
    expect(revealDataDir).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(logFailure).not.toHaveBeenCalled();
  });

  it("a failed Show data folder is forgotten when the next one works", async () => {
    revealDataDir.mockRejectedValueOnce(new Error("open exited with 1"));
    renderPanel();
    const show = screen.getByRole("button", { name: en.boot.showDataFolder });
    await userEvent.click(show);
    expect(screen.getByRole("alert").textContent).toContain(
      en.boot.revealFailed,
    );
    await userEvent.click(show);
    expect(revealDataDir).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failure is logged under REVEAL and says where the folder is", async () => {
    const error = new Error("open exited with 1");
    revealDataDir.mockRejectedValueOnce(error);
    renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: en.boot.showDataFolder }),
    );
    expect(logFailure).toHaveBeenCalledWith("REVEAL", error);
    expect(screen.getByRole("alert").textContent).toContain(
      en.boot.revealFailed,
    );
  });
});
