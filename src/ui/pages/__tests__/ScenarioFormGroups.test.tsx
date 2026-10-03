// @vitest-environment jsdom
//
// ADR 0102 (#52): the scenario form groups its fields into three fieldsets — permanent
// levels, temporary shocks and a one-off price crash — each named by its legend and
// described by one line of help.
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { ScenarioForm } from "../ScenarioForm";

const s = en.scenarios;

function renderForm() {
  render(
    <ScenarioForm
      assumptions={assumptions}
      scenario={null}
      onSubmit={() => undefined}
      onCancel={() => undefined}
    />,
  );
}

function group(name: string, description: string) {
  return screen.getByRole("group", { name, description });
}

describe("ScenarioForm groups (ADR 0102)", () => {
  it("puts the five level overrides under Permanent levels", () => {
    renderForm();
    const levels = group(s.groupLevels, s.groupLevelsHelp);
    for (const label of [
      s.fieldAppreciation,
      s.fieldRentIndexation,
      s.fieldVacancy,
      s.fieldPostFixationReset,
      s.fieldInflation,
    ]) {
      expect(within(levels).getByLabelText(label)).toBeTruthy();
    }
    expect(within(levels).queryByLabelText(s.fieldRateShock)).toBeNull();
  });

  it("puts the inflation and rate shocks under Temporary shocks", () => {
    renderForm();
    const shocks = group(s.groupShocks, s.groupShocksHelp);
    expect(within(shocks).getByLabelText(s.fieldInflationShock)).toBeTruthy();
    expect(within(shocks).getByLabelText(s.fieldRateShock)).toBeTruthy();
    expect(within(shocks).getAllByLabelText(s.forYears)).toHaveLength(2);
  });

  it("puts the crash and its year under One-off price crash", () => {
    renderForm();
    const crash = group(s.groupCrash, s.groupCrashHelp);
    expect(within(crash).getByLabelText(s.fieldValueCrash)).toBeTruthy();
    expect(within(crash).getByLabelText(s.atYear)).toBeTruthy();
  });

  it("keeps the name outside the groups", () => {
    renderForm();
    const name = screen.getByLabelText(s.name);
    expect(name.closest("fieldset")).toBeNull();
  });

  it("says a property's own growth rate wins over a level", () => {
    expect(s.groupLevelsHelp).toMatch(/own growth rate keeps it/);
  });
});
