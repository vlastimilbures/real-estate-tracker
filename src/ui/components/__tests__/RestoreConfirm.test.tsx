// @vitest-environment jsdom
//
// ADR 0148 §1 (#260 item 6): a refused backup lists its out-of-range values too, in the
// error colour like the rest of its table; the confirm step's warnings use the warning
// colour.
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { IssueTable } from "../RestoreConfirm";
import { useUiStore } from "../../../state/uiStore";
import type { RestoreIssue } from "../../../state/backup";

const issues: RestoreIssue[] = [
  {
    table: "properties",
    id: "javorova",
    column: "purchase_price",
    rule: "NEGATIVE_AMOUNT",
  },
  {
    table: "properties",
    id: "javorova",
    column: "size_m2",
    rule: "OUT_OF_RANGE",
    range: { min: 1, max: 10_000 },
  },
];

const problemColours = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => (r.lastElementChild as HTMLElement).style.color);

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("IssueTable colours", () => {
  it("a refused file shows every row, out-of-range ones included, in the error colour", () => {
    render(<IssueTable issues={issues} />);
    expect(problemColours()).toEqual(["var(--negative)", "var(--negative)"]);
  });

  it("the confirm step's warnings use the warning colour", () => {
    render(<IssueTable issues={issues.slice(1)} warning />);
    expect(problemColours()).toEqual(["var(--warn)"]);
  });
});
