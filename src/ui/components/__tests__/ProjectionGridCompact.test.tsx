// @vitest-environment jsdom
//
// ADR 0211 (#386): the year-by-year grid has no Period column; each Year cell carries its
// span as tooltip and screen-reader text; the rows are compact.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { isoDate, portfolioProjection } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { ProjectionGrid } from "../ProjectionGrid";

const rows = portfolioProjection(portfolio, assumptions);

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("ProjectionGrid (ADR 0211)", () => {
  it("has no Period column", () => {
    render(<ProjectionGrid rows={rows} baseDate={assumptions.baseDate} />);
    expect(
      screen.queryByRole("columnheader", { name: en.projGrid.period }),
    ).toBeNull();
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0].textContent).toBe(en.projGrid.year);
    expect(headers[1].textContent).toBe(en.projGrid.value);
  });

  it("each Year cell's text and tooltip include its period", () => {
    const { container } = render(
      <ProjectionGrid rows={rows} baseDate={assumptions.baseDate} />,
    );
    const years = [
      ...container.querySelectorAll<HTMLElement>("tbody td.sticky-col"),
    ];
    expect(years).toHaveLength(rows.length);
    expect(years[1].textContent).toBe(
      `Y1 · ${rows[1].calendarYear}, Jul 2026 – Jun 2027`,
    );
    expect(years[1].title).toBe("Jul 2026 – Jun 2027");
    expect(years[1].querySelector(".sr-only")?.textContent).toBe(
      ", Jul 2026 – Jun 2027",
    );
    expect(years[0].title).toBe(en.projGrid.opening);
  });

  it("with calendar years a Year cell is the year alone", () => {
    const { container } = render(
      <ProjectionGrid rows={rows} baseDate={isoDate("2025-12-15")} />,
    );
    const y1 = container.querySelectorAll<HTMLElement>(
      "tbody td.sticky-col",
    )[1];
    expect(y1.textContent).toBe(`Y1 · ${rows[1].calendarYear}`);
    expect(y1.title).toBe("");
  });

  it("is the compact table", () => {
    const { container } = render(
      <ProjectionGrid rows={rows} baseDate={assumptions.baseDate} />,
    );
    expect(container.querySelector("table")?.className).toBe("data compact");
  });
});
