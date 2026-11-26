// @vitest-environment jsdom
//
// The property selector's DOM, pinned before its four renderers become two (#492): the
// pills' classes, pressed states, titles and test ids in both modes, the dropdown's root
// and trigger, and what a pick sends.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertySelect } from "../PropertySelect";

const options = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    value: `p${i}`,
    label: `Byt ${i}`,
  }));

/** The markup, with React's generated ids (which depend on render order) named alike. */
function html(container: HTMLElement): string {
  return container.innerHTML.replace(/«[^»]+»|:r[0-9a-z]+:/g, "«id»");
}

describe("multi pills", () => {
  it("renders the All pill, then a pill per option", () => {
    const { container } = render(
      <PropertySelect
        mode="multi"
        options={options(2)}
        allLabel="All"
        selected={["p1"]}
        onChange={vi.fn()}
        testId="dashboard-filter"
      />,
    );
    expect(html(container)).toMatchInlineSnapshot(
      `"<div class="pill-group" role="group" aria-label="All" data-testid="dashboard-filter"><button type="button" class="pill" aria-pressed="false" data-testid="dashboard-filter-all">All</button><button type="button" class="pill" aria-pressed="false" data-testid="dashboard-filter-p0">Byt 0</button><button type="button" class="pill on" aria-pressed="true" data-testid="dashboard-filter-p1">Byt 1</button></div>"`,
    );
  });

  it("with nothing selected, All is the pressed pill", () => {
    const { container } = render(
      <PropertySelect
        mode="multi"
        options={options(1)}
        allLabel="All"
        selected={[]}
        onChange={vi.fn()}
        testId="filter"
      />,
    );
    expect(html(container)).toMatchInlineSnapshot(
      `"<div class="pill-group" role="group" aria-label="All" data-testid="filter"><button type="button" class="pill on" aria-pressed="true" data-testid="filter-all">All</button><button type="button" class="pill" aria-pressed="false" data-testid="filter-p0">Byt 0</button></div>"`,
    );
  });

  it("adds an option, removes it again, and All clears the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PropertySelect
        mode="multi"
        options={options(3)}
        allLabel="All"
        selected={["p0"]}
        onChange={onChange}
        testId="dashboard-filter"
      />,
    );
    await user.click(screen.getByTestId("dashboard-filter-p2"));
    await user.click(screen.getByTestId("dashboard-filter-p0"));
    await user.click(screen.getByTestId("dashboard-filter-all"));
    expect(onChange.mock.calls).toEqual([[["p0", "p2"]], [[]], [[]]]);
  });
});

describe("single pills", () => {
  it("renders a segmented group with each name as its title", () => {
    const { container } = render(
      <PropertySelect
        mode="single"
        options={options(2)}
        selected="p0"
        onChange={vi.fn()}
        ariaLabel="Entity"
        testId="entity"
      />,
    );
    expect(html(container)).toMatchInlineSnapshot(
      `"<div class="pill-group segmented" role="group" aria-label="Entity" data-testid="entity"><button type="button" class="pill on" aria-pressed="true" title="Byt 0">Byt 0</button><button type="button" class="pill" aria-pressed="false" title="Byt 1">Byt 1</button></div>"`,
    );
  });

  it("sends the picked option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PropertySelect
        mode="single"
        options={options(2)}
        selected="p0"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Byt 1" }));
    expect(onChange.mock.calls).toEqual([["p1"]]);
  });
});

describe("dropdowns (past five options)", () => {
  it("multi: the root and the trigger carry the test ids", () => {
    const { container } = render(
      <PropertySelect
        mode="multi"
        options={options(6)}
        allLabel="All"
        selected={["p1", "p2"]}
        onChange={vi.fn()}
        testId="dashboard-filter"
      />,
    );
    expect(html(container)).toMatchInlineSnapshot(
      `"<div class="property-select" data-testid="dashboard-filter"><button type="button" class="property-select-trigger pill on" aria-haspopup="listbox" aria-expanded="false" data-testid="dashboard-filter-trigger"><span id="«id»">2 selected</span><svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg></button></div>"`,
    );
  });

  it("multi: toggles in the open list and keeps it open", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PropertySelect
        mode="multi"
        options={options(6)}
        allLabel="All"
        selected={["p1"]}
        onChange={onChange}
        testId="dashboard-filter"
      />,
    );
    await user.click(screen.getByTestId("dashboard-filter-trigger"));
    await user.click(screen.getByRole("option", { name: "Byt 3" }));
    await user.click(screen.getByRole("option", { name: "Byt 1" }));
    await user.click(screen.getByRole("option", { name: "All" }));
    expect(onChange.mock.calls).toEqual([[["p1", "p3"]], [[]], [[]]]);
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("single: the root carries the test id; the trigger has none", () => {
    const { container } = render(
      <PropertySelect
        mode="single"
        options={options(6)}
        selected="p3"
        onChange={vi.fn()}
        ariaLabel="Entity"
        testId="entity"
      />,
    );
    expect(html(container)).toMatchInlineSnapshot(
      `"<div class="property-select" data-testid="entity"><span id="«id»" class="sr-only">Entity</span><button type="button" class="property-select-trigger pill on" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="«id» «id»"><span id="«id»">Byt 3</span><svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg></button></div>"`,
    );
  });
});
