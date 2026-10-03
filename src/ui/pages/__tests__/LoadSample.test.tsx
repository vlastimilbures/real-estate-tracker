// @vitest-environment jsdom
//
// ADR 0112: Settings → Backup offers "Load sample portfolio" only while the portfolio has
// no properties. Loading confirms with a message; a refusal shows in the error panel.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage as Settings } from "../Settings";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { SampleNotEmptyError } from "../../../state/backup";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

const EMPTY = {
  properties: [],
  mortgages: [],
  valuations: [],
  leases: [],
  holdingCosts: [],
};

beforeEach(() => {
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "settings",
      settingsTab: "backup",
      unsavedSources: [],
      unsavedChanges: false,
    });
    usePortfolioStore.setState({
      status: "ready",
      portfolio: EMPTY,
      assumptions,
      scenarios: [],
      sample: { active: false, dismissed: false },
      backup: { lastAt: null, lastFile: null, changedSince: false },
      loadSample: vi.fn(),
    });
  });
});

const loadButton = () =>
  screen.queryByRole("button", { name: en.sample.loadAction });

describe("Settings → Backup: load sample (ADR 0112)", () => {
  it("is offered on an empty portfolio", () => {
    render(<Settings />);
    expect(screen.getByText(en.sample.panelTitle)).toBeTruthy();
    expect(screen.getByText(en.sample.loadBody)).toBeTruthy();
    expect(loadButton()).toBeTruthy();
  });

  it("is not offered while the portfolio has properties", () => {
    act(() => usePortfolioStore.setState({ portfolio }));
    render(<Settings />);
    expect(loadButton()).toBeNull();
  });

  it("loads the sample and confirms", async () => {
    const loadSample = vi.fn(() => {
      usePortfolioStore.setState({
        portfolio,
        sample: { active: true, dismissed: false },
      });
      return Promise.resolve();
    });
    act(() => usePortfolioStore.setState({ loadSample }));
    render(<Settings />);

    await userEvent.click(loadButton()!);

    expect(loadSample).toHaveBeenCalledOnce();
    expect(screen.getByText(en.sample.loaded)).toBeTruthy();
    expect(loadButton()).toBeNull();
    expect(
      screen.getByRole("button", { name: en.sample.clearAction }),
    ).toBeTruthy();
  });

  it("shows the refusal when the portfolio is no longer empty", async () => {
    const loadSample = vi.fn(() => Promise.reject(new SampleNotEmptyError()));
    act(() => usePortfolioStore.setState({ loadSample }));
    render(<Settings />);

    await userEvent.click(loadButton()!);

    expect(screen.getByText(en.sample.errNotEmpty)).toBeTruthy();
  });
});
