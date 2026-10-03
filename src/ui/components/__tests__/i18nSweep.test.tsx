// @vitest-environment jsdom
//
// UX-034: strings that used to be hard-coded English show in the UI language.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AsOfPicker } from "../AsOfPicker";
import { PropertySelect } from "../PropertySelect";
import { DateInput } from "../DateInput";
import { StressPresetsPanel } from "../../pages/ScenariosPanels";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";

vi.mock("../../../lib/today", () => ({
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
}));

const ru = getDict("ru");
const cs = getDict("cs");

beforeEach(() => act(() => useUiStore.setState({ language: "ru" })));

describe("UX-034 i18n sweep", () => {
  it("As-of picker: group name and year chips", () => {
    render(<AsOfPicker value={null} onChange={() => undefined} />);
    expect(
      screen.getByRole("group", { name: ru.common.asOfGroup }),
    ).toBeTruthy();
    expect(screen.getByTestId("asof-1y").textContent).toBe(
      ru.common.plusYears(1),
    );
    expect(screen.getByTestId("asof-5y").textContent).toBe(
      ru.common.plusYears(5),
    );
    expect(ru.common.plusYears(5)).not.toMatch(/y$/);
  });

  it("stress presets: chip labels and generated names", async () => {
    const onAddPreset = vi.fn();
    render(
      <StressPresetsPanel
        busy={false}
        crashAtYear={5}
        onCrashAtYearChange={() => undefined}
        onAddPreset={onAddPreset}
      />,
    );
    const pp = ru.scenarios.plusPp(2);
    expect(pp).not.toContain("pp");
    await userEvent.click(screen.getAllByRole("button", { name: pp })[0]!);
    expect(onAddPreset.mock.calls[0]![0]).toBe(
      ru.scenarios.rateForYears(pp, 3),
    );
    await userEvent.click(screen.getByRole("button", { name: "−20%" }));
    expect(onAddPreset.mock.calls[1]![0]).toBe(
      ru.scenarios.crashTitle(
        "−20%",
        ru.scenarios.crashAt(ru.common.plusYears(5)),
      ),
    );
    expect(
      screen.getByRole("button", { name: ru.common.plusYears(10) }),
    ).toBeTruthy();
  });

  it("property search label", async () => {
    act(() => useUiStore.setState({ language: "cs" }));
    render(
      <PropertySelect
        mode="multi"
        // The search box shows from 13 properties up.
        options={Array.from({ length: 13 }, (_, i) => ({
          value: `p${i}`,
          label: `Byt ${i}`,
        }))}
        allLabel={cs.common.all}
        selected={[]}
        onChange={() => undefined}
      />,
    );
    await userEvent.click(screen.getAllByRole("button")[0]!);
    const search = screen.getByRole("searchbox", {
      name: cs.common.searchProperties,
    }) as HTMLInputElement;
    expect(search.placeholder).toBe(cs.common.searchPlaceholder);
  });

  it("calendar navigation and weekday labels follow the language", async () => {
    act(() => useUiStore.setState({ language: "cs" }));
    render(<DateInput value="01.10.2026" onChange={() => undefined} />);
    await userEvent.click(
      screen.getByRole("button", { name: cs.calendar.open }),
    );
    expect(
      screen.getByRole("button", { name: /předchozí měsíc/i }),
    ).toBeTruthy();
    const weekday = document.querySelector(".rdp-weekday")!;
    expect(weekday.getAttribute("aria-label")).not.toMatch(/day$/);
  });
});
