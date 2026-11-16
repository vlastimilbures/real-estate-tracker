// @vitest-environment jsdom
//
// ADR 0214 (#391): the explanations that sat in panel headers are help lines in the
// body (or one click away), and a panel ends with at most one note. ADR 0217 (#416):
// definitions sit behind the info icon in the head; instructions stay help lines.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { ScenarioListPanel } from "../ScenariosPanels";
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

/** The info icon of a panel and the text it shows, hidden at rest (ADR 0217); in the
 *  head unless `within` names another container. */
function infoOf(panel: HTMLElement, topic: string, where = ".panel-head") {
  const button = within(panel).getByRole("button", {
    name: `${en.common.aboutThis}: ${topic}`,
    hidden: true,
  });
  expect(button.closest(where)).toBeTruthy();
  return document.getElementById(button.getAttribute("aria-controls")!)!;
}

function scenariosPanel(open: boolean) {
  return render(
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
      presets={{
        open,
        onToggle: () => undefined,
        bar: <p>bar</p>,
      }}
    />,
  );
}

describe("Stress presets (ADR 0220 §1, amends 0217 §4)", () => {
  it("open: the explanation is an info icon beside the Stress presets sub-heading, not a body line", () => {
    scenariosPanel(true);
    const panel = panelOf(sc.listTitle);
    const pop = infoOf(panel, sc.presetsTitle, ".subhead-row");
    expect(pop.textContent).toBe(sc.presetsHint(DEFAULT_SHOCK_YEARS));
    expect(pop.closest(".subhead-row")?.querySelector("h3")?.textContent).toBe(
      sc.presetsTitle,
    );
    // The panel head has no info icon of its own.
    expect(panel.querySelector(".panel-head .info-tip")).toBeNull();
    expect(
      screen
        .queryByText(sc.presetsHint(DEFAULT_SHOCK_YEARS))
        ?.closest(".panel-help"),
    ).toBeFalsy();
  });

  it("closed: the explanation stays behind the icon, inside the closed presets", () => {
    scenariosPanel(false);
    const panel = panelOf(sc.listTitle);
    const pop = infoOf(panel, sc.presetsTitle, ".preset-drawer[hidden]");
    expect(pop.hidden).toBe(true);
  });
});

describe("other header explanations: instructions stay help lines, definitions go to the icon (ADR 0214, 0217)", () => {
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
    // The head's hint is context only: the count (ADR 0220 §1).
    expect(panel.querySelector(".panel-head .hint")?.textContent).toBe(
      sc.comparedOf(0, 3),
    );
    expect(panel.querySelector(".panel-help")?.textContent).toBe(
      sc.listHint(3),
    );
  });

  it("Mortgage blocks: a definition, so behind the info icon (ADR 0217)", () => {
    render(<MortgagesPanel propertyId="p1" rows={[]} />);
    const panel = panelOf(pd.mortgagesTitle);
    expect(panel.querySelector(".panel-head .hint")).toBeNull();
    expect(panel.querySelector(".panel-help")).toBeNull();
    expect(infoOf(panel, pd.mortgagesTitle).textContent).toBe(pd.mortgagesHint);
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
