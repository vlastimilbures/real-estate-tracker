// @vitest-environment jsdom
//
// ADR 0094: the first-run sample is labelled on Dashboard and Properties, can be kept
// ("Keep exploring") or cleared through a confirmation dialog, and stays clearable from
// Settings → Backup. Empty Properties offers Add + Import; the empty Dashboard lists
// the first steps.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../Dashboard";
import { Properties } from "../Properties";
import { SettingsPage as Settings } from "../Settings";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { SafetyBackupError } from "../../../state/backup";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

vi.mock("../../../lib/today", () => ({
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
  localIsoDay: () => "2026-10-01",
}));

const empty = {
  properties: [],
  mortgages: [],
  valuations: [],
  leases: [],
  holdingCosts: [],
};

function setSample(active: boolean, dismissed = false) {
  act(() => usePortfolioStore.setState({ sample: { active, dismissed } }));
}

beforeEach(() =>
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "dashboard",
      settingsTab: "assumptions",
      sampleClearedBackup: null,
      unsavedSources: [],
      unsavedChanges: false,
    });
    usePortfolioStore.setState({
      status: "ready",
      portfolio,
      assumptions,
      scenarios: [],
      sample: { active: true, dismissed: false },
      clearSample: vi.fn(),
      dismissSampleBanner: vi.fn(),
    });
  }),
);

describe("sample banner (ADR 0094)", () => {
  it.each([
    ["Dashboard", Dashboard],
    ["Properties", Properties],
  ])("%s says the data is a fictional sample", (_name, Page) => {
    render(<Page />);
    const banner = screen.getByText(en.sample.banner);
    expect(banner.textContent).toMatch(/sample/);
    expect(banner.textContent).toMatch(/fictional/);
    expect(
      screen.getByRole("button", { name: en.sample.clearAction }),
    ).toBeTruthy();
  });

  it("is hidden once dismissed or when there is no sample", () => {
    setSample(true, true);
    const { unmount } = render(<Dashboard />);
    expect(screen.queryByText(en.sample.banner)).toBeNull();
    unmount();
    setSample(false);
    render(<Properties />);
    expect(screen.queryByText(en.sample.banner)).toBeNull();
  });

  it("Keep exploring dismisses it", async () => {
    const dismissSampleBanner = vi.fn().mockResolvedValue({ ok: true });
    act(() => usePortfolioStore.setState({ dismissSampleBanner }));
    render(<Dashboard />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.keepExploring }),
    );
    expect(dismissSampleBanner).toHaveBeenCalledOnce();
  });
});

describe("Clear sample dialog (ADR 0094)", () => {
  it("states what is deleted and kept; Cancel clears nothing", async () => {
    const clearSample = vi.fn();
    act(() => usePortfolioStore.setState({ clearSample }));
    render(<Properties />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.clearAction }),
    );
    const dialog = screen.getByRole("dialog", { name: en.sample.dialogTitle });
    expect(dialog.textContent).toContain(en.sample.dialogDeletes);
    expect(dialog.textContent).toContain(en.sample.dialogKeeps);
    expect(dialog.textContent).toContain(en.sample.dialogBackup);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(clearSample).not.toHaveBeenCalled();
  });

  it("clears, names the safety backup and opens the Dashboard", async () => {
    const clearSample = vi
      .fn()
      .mockResolvedValue({ safetyBackup: "before.json" });
    act(() => {
      usePortfolioStore.setState({ clearSample });
      useUiStore.setState({ route: "properties" });
    });
    render(<Properties />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.clearAction }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.confirm }),
    );
    expect(clearSample).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useUiStore.getState().route).toBe("dashboard");
    expect(useUiStore.getState().sampleClearedBackup).toBe("before.json");
  });

  it("the Dashboard names the safety backup until dismissed", async () => {
    act(() => {
      usePortfolioStore.setState({
        portfolio: empty,
        sample: { active: false, dismissed: false },
      });
      useUiStore.setState({ sampleClearedBackup: "before.json" });
    });
    render(<Dashboard />);
    expect(screen.getByText(en.sample.cleared("before.json"))).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.dismiss }),
    );
    expect(screen.queryByText(en.sample.cleared("before.json"))).toBeNull();
  });

  it("shows a failed safety backup and keeps the dialog open", async () => {
    const clearSample = vi
      .fn()
      .mockRejectedValue(new SafetyBackupError("disk full"));
    act(() => usePortfolioStore.setState({ clearSample }));
    render(<Dashboard />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.clearAction }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.confirm }),
    );
    expect(
      screen.getByText(en.sample.safetyBackupFailed("disk full")),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("Settings → Backup sample panel (ADR 0094)", () => {
  it("is shown while the sample is active, even after dismissing the banner", () => {
    setSample(true, true);
    act(() => useUiStore.setState({ settingsTab: "backup" }));
    render(<Settings />);
    expect(screen.getByText(en.sample.panelTitle)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: en.sample.clearAction }),
    ).toBeTruthy();
  });

  it("hint does not claim the sample came on first launch (ADR 0116)", () => {
    setSample(true, true);
    act(() => useUiStore.setState({ settingsTab: "backup" }));
    render(<Settings />);
    expect(screen.getByText(en.sample.loadHint)).toBeTruthy();
    expect(screen.queryByText(/first launch/i)).toBeNull();
  });

  it("is hidden when there is no sample", () => {
    setSample(false);
    act(() => useUiStore.setState({ settingsTab: "backup" }));
    render(<Settings />);
    expect(screen.queryByText(en.sample.panelTitle)).toBeNull();
  });
});

describe("empty states (ADR 0094)", () => {
  beforeEach(() =>
    act(() =>
      usePortfolioStore.setState({
        portfolio: empty,
        sample: { active: false, dismissed: false },
      }),
    ),
  );

  it("empty Properties offers Add property and Import CSV", async () => {
    render(<Properties />);
    const adds = screen.getAllByRole("button", {
      name: en.properties.addProperty,
    });
    expect(adds).toHaveLength(2); // header + empty state
    await userEvent.click(adds[1]!);
    expect(
      screen.getByRole("dialog", { name: en.properties.addProperty }),
    ).toBeTruthy();
  });

  it("empty Properties Import CSV opens the import page", async () => {
    render(<Properties />);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.importCsv }),
    );
    expect(useUiStore.getState().route).toBe("import");
  });

  it("empty Dashboard lists the first steps with links", async () => {
    render(<Dashboard />);
    expect(screen.getByText(en.sample.gettingStartedTitle)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.stepAssumptions }),
    );
    expect(useUiStore.getState().route).toBe("settings");
    expect(useUiStore.getState().settingsTab).toBe("assumptions");
  });

  it("the Getting started backup step opens Settings → Backup", async () => {
    render(<Dashboard />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.stepBackup }),
    );
    expect(useUiStore.getState().route).toBe("settings");
    expect(useUiStore.getState().settingsTab).toBe("backup");
  });

  it("the Getting started add step opens the new-property form", async () => {
    render(<Dashboard />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.stepAddProperty }),
    );
    expect(useUiStore.getState().route).toBe("properties");
    expect(useUiStore.getState().newPropertyRequested).toBe(true);
  });
});
