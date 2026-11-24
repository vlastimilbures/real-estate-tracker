// @vitest-environment jsdom
//
// ADR 0248 §1–§2 (#549): while a scenario action runs the page disables the presets,
// Duplicate and Delete, which drops focus to <body>. A preset or Duplicate gets focus
// back after any outcome; a failed Delete puts it on the confirm's Cancel. Focus the
// user moved stays where it is.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { usePortfolioStore } from "../../../state/portfolioStore";
import type { MutationResult } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import type { Scenario } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { deferred, type Deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

// The compare runs the engine; these tests need the list and the presets only.
vi.mock("../ScenarioCompare", () => ({ CompareView: () => null }));

const sc = en.scenarios;
const saved: Scenario = { id: "s1", name: "Rates up", overrides: {} };
const ok: MutationResult = { ok: true };
const failure: MutationResult = {
  ok: false,
  error: { kind: "other", message: "Disk full" },
};

let write: Deferred<MutationResult>;

beforeEach(() => {
  write = deferred();
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      scenarios: [saved],
      addScenario: () => write.promise,
      duplicateScenario: () => write.promise,
      removeScenario: () => write.promise,
    });
    useUiStore.setState({ route: "scenarios", presetsOpen: true });
  });
});

const preset = () => screen.getByRole("button", { name: sc.plusPp(2) });
const duplicate = () => screen.getByRole("button", { name: sc.duplicate });

/** Press `button`, check it disabled, and fire the focus fixup now. */
async function press(button: () => HTMLElement) {
  render(
    <>
      <Scenarios />
      <button type="button">Elsewhere</button>
    </>,
  );
  await userEvent.click(button());
  expect(button()).toHaveProperty("disabled", true);
}

describe("scenario actions: focus after the outcome (ADR 0248 §2)", () => {
  for (const [name, button] of [
    ["a preset", preset],
    ["Duplicate", duplicate],
  ] as const)
    for (const [outcome, result] of [
      ["saved", ok],
      ["failed", failure],
    ] as const)
      it(`${name} gets focus back once it ${outcome} (#549)`, async () => {
        await press(button);
        act(() => button().blur());
        expect(document.activeElement).toBe(document.body);
        await act(async () => write.resolve(result));
        expect(button()).toHaveProperty("disabled", false);
        expect(document.activeElement).toBe(button());
      });

  it("leaves focus where the user moved it while a preset saved", async () => {
    await press(preset);
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => write.resolve(ok));
    expect(preset()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("scenario Delete: focus after a failure (ADR 0248 §1)", () => {
  it("puts focus on the confirm's Cancel (#549)", async () => {
    render(<Scenarios />);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    const yes = () =>
      screen.getByRole("button", {
        name: new RegExp(`^(${en.common.yesDelete}|${en.common.deleting})$`),
      });
    await userEvent.click(yes());
    expect(yes()).toHaveProperty("disabled", true);
    act(() => yes().blur());
    await act(async () => write.resolve(failure));
    expect(yes()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.common.cancel }),
    );
  });

  it("a successful delete leaves focus to the confirm row: the list panel (ADR 0173)", async () => {
    render(<Scenarios />);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    const yes = () =>
      screen.getByRole("button", {
        name: new RegExp(`^(${en.common.yesDelete}|${en.common.deleting})$`),
      });
    await userEvent.click(yes());
    expect(yes()).toHaveProperty("disabled", true);
    act(() => yes().blur());
    await act(async () => write.resolve(ok));
    // Level 2: the page's h1 has the same name.
    const list = screen
      .getByRole("heading", { level: 2, name: sc.listTitle })
      .closest("section");
    expect(document.activeElement).toBe(list);
  });
});
