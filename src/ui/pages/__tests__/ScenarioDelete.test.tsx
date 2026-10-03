// @vitest-environment jsdom
//
// UX-020: deleting a saved scenario asks first, like every other delete.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioListPanel } from "../ScenariosPanels";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Scenario } from "../../../engine";

const en = getDict("en");
const scenario: Scenario = {
  id: "s1",
  name: "Rates up",
  overrides: {},
  createdAt: new Date(Date.UTC(2026, 0, 1)),
};

function renderList(onDelete: (s: Scenario) => void) {
  render(
    <ScenarioListPanel
      scenarios={[scenario]}
      baseOn
      onToggleBase={() => undefined}
      selectedIds={[]}
      maxCompare={4}
      onToggle={() => undefined}
      busy={false}
      onEdit={() => undefined}
      onDuplicate={() => undefined}
      onDelete={onDelete}
    />,
  );
}

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("scenario delete confirmation (UX-020)", () => {
  it("asks before deleting and names the scenario", async () => {
    const onDelete = vi.fn();
    renderList(onDelete);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.getByText(en.scenarios.confirmDelete("Rates up")),
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(onDelete).toHaveBeenCalledWith(scenario);
  });

  it("Cancel keeps the scenario", async () => {
    const onDelete = vi.fn();
    renderList(onDelete);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.queryByText(en.scenarios.confirmDelete("Rates up")),
    ).toBeNull();
  });
});
