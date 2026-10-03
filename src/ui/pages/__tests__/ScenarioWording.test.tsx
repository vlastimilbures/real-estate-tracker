// @vitest-environment jsdom
//
// ADR 0090 (#15): Scenarios wording matches the model — a price crash is permanent,
// shock deltas are percentage points, crash timing 0 is the projection start (with its
// date), the compare hint says Base does not count, and the lens toggle is on the page.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  realProjection,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { fmtDate } from "../../../lib/format";
import { en } from "../../../i18n/en";
import type { CompareResult } from "../../model/compare";

const baseResult: CompareResult = (() => {
  const projection = portfolioProjection(portfolio, assumptions);
  return {
    id: "base",
    name: "Base",
    projection,
    realProjection: realProjection(projection, cpiIndex(assumptions)),
    kpis: portfolioKpis(portfolio, applyScenario(assumptions, {})),
  };
})();

vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => [baseResult],
}));

const { StressPresetsPanel, ScenarioListPanel } =
  await import("../ScenariosPanels");
const { ShockPairFields } = await import("../ScenarioFormFields");
const { ScenarioForm } = await import("../ScenarioForm");
const { Scenarios } = await import("../Scenarios");

const startDate = fmtDate(assumptions.baseDate);

beforeEach(() =>
  act(() =>
    useUiStore.setState({
      language: "en",
      mode: "nominal",
      compareIds: [],
      compareBase: true,
      crashAtYear: 0,
    }),
  ),
);

describe("Scenarios wording (ADR 0090)", () => {
  it("preset hint says the price crash is permanent", () => {
    render(
      <StressPresetsPanel
        busy={false}
        baseDate={assumptions.baseDate}
        crashAtYear={0}
        onCrashAtYearChange={() => undefined}
        onAddPreset={() => undefined}
      />,
    );
    const hint = en.scenarios.presetsHint(3);
    expect(screen.getByText(hint)).toBeTruthy();
    expect(hint).toMatch(/price crash is permanent/);
  });

  it("crash timing 0 is the projection start, with its date", () => {
    render(
      <StressPresetsPanel
        busy={false}
        baseDate={assumptions.baseDate}
        crashAtYear={0}
        onCrashAtYearChange={() => undefined}
        onAddPreset={() => undefined}
      />,
    );
    const start = screen.getByRole("button", { name: en.scenarios.atStart });
    expect(start.getAttribute("aria-pressed")).toBe("true");
    // The start date moved from the timing button to the level tooltip (ADR 0101).
    const level = screen.getByRole("button", { name: "−20%" });
    expect(level.getAttribute("title")).toContain(
      en.scenarios.atStartTitle(startDate),
    );
    expect(level.getAttribute("title")).toContain("projection start");
    const later = screen.getByRole("button", {
      name: en.common.plusYears(5),
    });
    expect(later.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: en.common.today })).toBeNull();
  });

  it("shock deltas show a pp suffix and a worked example", () => {
    const { container } = render(
      <ShockPairFields
        deltaLabel={en.scenarios.fieldInflationShock}
        deltaHelp={en.scenarios.shockHelp}
        deltaValue=""
        deltaError={undefined}
        onDeltaChange={() => undefined}
        yearsValue=""
        yearsError={undefined}
        onYearsChange={() => undefined}
        defaultShockYears={3}
      />,
    );
    expect(container.querySelector(".suffix")!.textContent).toBe("pp");
    expect(screen.getByText(en.scenarios.shockHelp)).toBeTruthy();
    expect(en.scenarios.shockHelp).toContain("+2 pp turns 4.5 % into 6.5 %");
  });

  it("the crash year help names the projection start date", () => {
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByText(en.scenarios.zeroIsStart(startDate))).toBeTruthy();
    expect(en.scenarios.zeroIsStart(startDate)).toBe(
      `0 = projection start (${startDate})`,
    );
  });

  it("list hint says Base does not count toward the limit", () => {
    render(
      <ScenarioListPanel
        scenarios={[]}
        baseOn
        onToggleBase={() => undefined}
        selectedIds={[]}
        maxCompare={3}
        onToggle={() => undefined}
        busy={false}
        onEdit={() => undefined}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
      />,
    );
    const hint = en.scenarios.listHint(3);
    expect(screen.getByText(hint)).toBeTruthy();
    expect(hint).toMatch(/up to 3 scenarios/);
    expect(hint).toMatch(/Base is extra and does not count/);
  });

  it("the lens toggle on Scenarios switches the compare rows", async () => {
    window.scrollTo = vi.fn();
    act(() => usePortfolioStore.setState({ assumptions, scenarios: [] }));
    render(<Scenarios />);
    const lens = screen.getByRole("group", { name: en.shell.nominalOrReal });
    expect(
      screen.getByRole("rowheader", { name: en.scenarios.kpiCagrNominal }),
    ).toBeTruthy();
    await userEvent.click(
      within(lens).getByRole("button", { name: en.common.real }),
    );
    expect(
      screen.getByRole("rowheader", { name: en.scenarios.kpiCagrReal }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("rowheader", { name: en.scenarios.kpiCagrNominal }),
    ).toBeNull();
  });
});
