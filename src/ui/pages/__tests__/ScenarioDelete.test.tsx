// @vitest-environment jsdom
//
// UX-020: deleting a saved scenario asks first, like every other delete.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioListPanel } from "../ScenariosPanels";
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
      list={{
        scenarios: [scenario],
        baseOn: true,
        selectedIds: [],
        busy: false,
      }}
      actions={{
        toggleBase: () => undefined,
        toggle: () => undefined,
        edit: () => undefined,
        duplicate: () => undefined,
        remove: onDelete,
      }}
    />,
  );
}

describe("scenario row actions (ADR 0199)", () => {
  it("are icon-only row actions: Edit, Duplicate and a destructive Delete", () => {
    renderList(vi.fn(ok));
    const names = [en.common.edit, en.scenarios.duplicate, en.common.delete];
    for (const name of names) {
      const button = screen.getByRole("button", { name });
      expect(button.classList.contains("row-action")).toBe(true);
      expect(button.querySelector("svg")).not.toBeNull();
    }
    expect(
      screen
        .getByRole("button", { name: en.common.delete })
        .classList.contains("danger"),
    ).toBe(true);
  });
});

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
    // Closes once the delete landed (ADR 0143).
    expect(
      screen.queryByText(en.scenarios.confirmDelete("Rates up")),
    ).toBeNull();
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
