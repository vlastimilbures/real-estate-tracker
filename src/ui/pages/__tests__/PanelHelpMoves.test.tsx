// @vitest-environment jsdom
//
// ADR 0214 (#391): the explanations that sat in panel headers are help lines in the
// body (or one click away), and a panel ends with at most one note.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { StressPresetsPanel, ScenarioListPanel } from "../ScenariosPanels";
import { MortgagesPanel } from "../PropertyEntityPanels";
import { AcquisitionPanel } from "../PropertyDetailPanels";
import type { AcquisitionView } from "../../model/acquisition";
import { useUiStore } from "../../../state/uiStore";
import { DEFAULT_SHOCK_YEARS } from "../ScenarioForm";
import { D } from "../../../lib/money";
import { en } from "../../../i18n/en";

const sc = en.scenarios;
const pd = en.propertyDetail;

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

const panelOf = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("section")!;

function presets(open: boolean) {
  return render(
    <StressPresetsPanel
      open={open}
      onToggleOpen={() => undefined}
      busy={false}
      baseDate={new Date(Date.UTC(2026, 0, 1))}
      crashAtYear={0}
      onCrashAtYearChange={() => undefined}
      onAddPreset={() => undefined}
    />,
  );
}

describe("Stress presets (ADR 0214 §4, amends 0106)", () => {
  it("open: the explanation leads the presets it explains, not the header", () => {
    presets(true);
    const panel = panelOf(sc.presetsTitle);
    expect(panel.querySelector(".panel-head .hint")).toBeNull();
    const toggle = within(panel).getByRole("button", { expanded: true });
    const region = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    )!;
    expect(
      within(region).getByText(sc.presetsHint(DEFAULT_SHOCK_YEARS)),
    ).toBeTruthy();
  });

  it("collapsed: the one-line summary only", () => {
    presets(false);
    expect(screen.queryByText(sc.presetsHint(DEFAULT_SHOCK_YEARS))).toBeNull();
    expect(screen.getByText(sc.presetsCollapsedSummary)).toBeTruthy();
  });
});

describe("other header explanations become help lines (ADR 0214 §4)", () => {
  it("Scenarios list", () => {
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
        onDelete={() => Promise.resolve({ ok: true as const })}
      />,
    );
    const panel = panelOf(sc.listTitle);
    expect(panel.querySelector(".panel-head .hint")).toBeNull();
    expect(panel.querySelector(".panel-help")?.textContent).toBe(
      sc.listHint(3),
    );
  });

  it("Mortgage blocks", () => {
    render(<MortgagesPanel propertyId="p1" rows={[]} />);
    const panel = panelOf(pd.mortgagesTitle);
    expect(panel.querySelector(".panel-head .hint")).toBeNull();
    expect(panel.querySelector(".panel-help")?.textContent).toBe(
      pd.mortgagesHint,
    );
  });
});

describe("Acquisition funding ends with one note (ADR 0214 §3)", () => {
  const view: AcquisitionView = {
    rows: [{ label: "Price", value: D(6_375_000), missing: "—" }],
    warning: null,
    note: pd.acqRecordedNote("bought at auction"),
    emptyLine: null,
  };

  it("the recorded note is the one note; how it is read is one click away", () => {
    render(<AcquisitionPanel view={view} onRecordFunding={() => undefined} />);
    const panel = panelOf(pd.acqTitle);
    const notes = panel.querySelectorAll(".panel-note");
    expect([...notes].map((n) => n.textContent)).toEqual([view.note]);
    expect(
      within(panel).getByRole("button", {
        name: `${en.common.aboutThis}: ${pd.acqTitle}`,
      }),
    ).toBeTruthy();
    expect(
      within(panel).getByText(pd.acqNote).closest("[hidden]"),
    ).not.toBeNull();
  });
});
