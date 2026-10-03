// @vitest-environment jsdom
//
// ADR 0101 (#51): the price-crash timing is a labelled setting ("When"), and each level
// button shows the timing it uses.
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

const timing = () => screen.getByRole("group", { name: sc.crashWhen });

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("crash timing is a setting (#51)", () => {
  it("is a labelled toggle with Start pressed", () => {
    render(<Harness onAddPreset={vi.fn()} />);
    const start = within(timing()).getByRole("button", { name: sc.atStart });
    expect(start.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(sc.crashWhen)).toBeTruthy();
    expect(screen.getByRole("button", { name: "−20%" })).toBeTruthy();
  });

  it("level buttons name the timing and add the timed preset", async () => {
    const onAddPreset = vi.fn();
    render(<Harness onAddPreset={onAddPreset} />);
    await userEvent.click(
      within(timing()).getByRole("button", { name: en.common.plusYears(5) }),
    );
    const level = screen.getByRole("button", { name: "−20% @ +5y" });
    await userEvent.click(level);
    expect(onAddPreset).toHaveBeenCalledWith("Price crash −20% @ +5y", {
      valueShock: { pct: rate("0.2"), atYear: 5 },
    });
  });
});
