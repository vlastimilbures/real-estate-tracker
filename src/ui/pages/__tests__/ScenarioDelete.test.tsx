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
import type { MutationResult } from "../../../state/portfolioStore";

const en = getDict("en");
const ok = async (): Promise<MutationResult> => ({ ok: true });
const scenario: Scenario = {
  id: "s1",
  name: "Rates up",
  overrides: {},
};

function renderList(
  onDelete: (s: { id: string; name: string }) => Promise<MutationResult>,
) {
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
    const onDelete = vi.fn(ok);
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
    const onDelete = vi.fn(ok);
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

// ADR 0123 (#107): a scenario row the app cannot read is listed with only a Delete,
// behind the same confirmation, instead of blocking startup.
describe("an unreadable scenario (ADR 0123)", () => {
  function renderUnreadable(
    onDelete: (s: { id: string; name: string }) => Promise<MutationResult>,
  ) {
    render(
      <ScenarioListPanel
        scenarios={[]}
        unreadable={[{ id: "bad", name: "Broken" }]}
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

  it("is listed with why it is left out, and no compare tick", () => {
    renderUnreadable(ok);
    const row = screen.getByText("Broken").closest("li")!;
    expect(row.textContent).toContain(en.scenarios.unreadableRow);
    expect(row.querySelector("input[type=checkbox]")).toBeNull();
    expect(screen.queryByText(en.scenarios.emptyList)).toBeNull();
  });

  it("is deleted after the usual confirmation", async () => {
    const onDelete = vi.fn(ok);
    renderUnreadable(onDelete);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(onDelete).toHaveBeenCalledWith({ id: "bad", name: "Broken" });
  });
});
