// @vitest-environment jsdom
//
// ADR 0154: replacing the data drops what described the old data — the notice, the
// failure and the last import report. Today each replacing action's UI calls
// `dataReplaced()` beside the store's own action; this pins the outcome at load sample and
// Clear sample (the Settings restore and the startup restore are pinned in
// BackupRestore.test.tsx and BootRestore.test.tsx). Characterisation for #468.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../pages/Settings";
import { ClearSampleButton } from "../components/ClearSampleDialog";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import type { CsvImportReport } from "../../state/csv";
import { toActionError } from "../../state/actionError";
import { assumptions, portfolio } from "../../engine/__tests__/support/seed";
import { en } from "../../i18n/en";
import { success } from "../../__tests__/support/result";

const EMPTY = {
  properties: [],
  mortgages: [],
  valuations: [],
  leases: [],
  holdingCosts: [],
};
const ui = () => useUiStore.getState();

/** What the old data left: a notice, a failure and an import report. */
function leftovers() {
  act(() =>
    useUiStore.setState({
      notice: { kind: "restored", file: "old-safety.json" },
      failure: { action: "import", error: toActionError(new Error("x")) },
      lastImport: { items: [] } as unknown as CsvImportReport,
    }),
  );
}

beforeEach(() => {
  act(() => {
    useUiStore.setState({
      route: "settings",
      settingsTab: "backup",
      notice: null,
      failure: null,
      lastImport: null,
    });
    usePortfolioStore.setState({
      status: { kind: "ready" },
      portfolio,
      assumptions,
      sample: { active: true, dismissed: false },
    });
  });
});

describe("dataReplaced at each replacing action (ADR 0154)", () => {
  it("load sample drops the notice, the failure and the import report", async () => {
    act(() =>
      usePortfolioStore.setState({
        portfolio: EMPTY,
        sample: { active: false, dismissed: false },
        loadSample: vi.fn(async () => success(undefined)) as never,
      }),
    );
    leftovers();
    render(<SettingsPage />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.loadAction }),
    );
    await waitFor(() => expect(ui().lastImport).toBeNull());
    expect(ui().notice).toBeNull();
    expect(ui().failure).toBeNull();
  });

  it("Clear sample drops them, then names its own safety copy", async () => {
    act(() =>
      usePortfolioStore.setState({
        clearSample: vi.fn(async () =>
          success({ safetyBackup: "before-clear.json" }),
        ) as never,
      }),
    );
    leftovers();
    render(<ClearSampleButton />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.clearAction }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.confirm }),
    );
    await waitFor(() =>
      expect(ui().notice).toEqual({
        kind: "sampleCleared",
        file: "before-clear.json",
      }),
    );
    expect(ui().failure).toBeNull();
    expect(ui().lastImport).toBeNull();
  });
});
