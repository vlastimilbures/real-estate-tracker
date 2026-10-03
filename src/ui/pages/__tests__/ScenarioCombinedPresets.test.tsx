// @vitest-environment jsdom
//
// ADR 0104 (#55): the "Combined" preset group saves a scenario that holds every part of
// its recipe in one click, and its crash follows the "When" timing (ADR 0101).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { StressPresetsPanel } from "../ScenariosPanels";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { rate, type ScenarioOverrides } from "../../../engine";

const en = getDict("en");
const sc = en.scenarios;

function Harness({
  onAddPreset,
}: {
  onAddPreset: (name: string, overrides: ScenarioOverrides) => void;
}) {
  const [atYear, setAtYear] = useState(0);
  return (
    <StressPresetsPanel
      busy={false}
      baseDate={new Date(Date.UTC(2026, 0, 1))}
      crashAtYear={atYear}
      onCrashAtYearChange={setAtYear}
      onAddPreset={onAddPreset}
    />
  );
}

const MILD = "Mild: Rates +2pp for 3y · Price crash −10%";
const SEVERE =
  "Severe: Rates +4pp for 3y · Inflation +3pp for 3y · Price crash −20%";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("combined stress presets (#55)", () => {
  it("shows a Combined group with Mild and Severe", () => {
    render(<Harness onAddPreset={vi.fn()} />);
    expect(screen.getByText(sc.combined)).toBeTruthy();
    const mild = screen.getByRole("button", { name: "Mild" });
    expect(mild.getAttribute("title")).toBe(
      `${MILD} · ${sc.atStartTitle("01.01.2026")}`,
    );
    expect(screen.getByRole("button", { name: "Severe" })).toBeTruthy();
  });

  it("Mild saves the rate shock and the crash in one click", async () => {
    const onAddPreset = vi.fn();
    render(<Harness onAddPreset={onAddPreset} />);
    await userEvent.click(screen.getByRole("button", { name: "Mild" }));
    expect(onAddPreset).toHaveBeenCalledTimes(1);
    expect(onAddPreset).toHaveBeenCalledWith(MILD, {
      rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
      valueShock: { pct: rate("0.1"), atYear: 0 },
    });
  });

  it("Severe saves rates, inflation and the crash in one click", async () => {
    const onAddPreset = vi.fn();
    render(<Harness onAddPreset={onAddPreset} />);
    await userEvent.click(screen.getByRole("button", { name: "Severe" }));
    expect(onAddPreset).toHaveBeenCalledWith(SEVERE, {
      rateShock: { deltaPa: rate("0.04"), durationYears: 3 },
      inflationShock: { deltaPa: rate("0.03"), durationYears: 3 },
      valueShock: { pct: rate("0.2"), atYear: 0 },
    });
  });

  it("the combined crash follows the When timing", async () => {
    const onAddPreset = vi.fn();
    render(<Harness onAddPreset={onAddPreset} />);
    const timing = screen.getByRole("group", { name: sc.crashWhen });
    await userEvent.click(
      within(timing).getByRole("button", { name: en.common.plusYears(5) }),
    );
    const mild = screen.getByRole("button", { name: "Mild @ +5y" });
    expect(mild.getAttribute("title")).toBe(`${MILD} @ +5y`);
    await userEvent.click(mild);
    expect(onAddPreset).toHaveBeenCalledWith(`${MILD} @ +5y`, {
      rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
      valueShock: { pct: rate("0.1"), atYear: 5 },
    });
  });
});
