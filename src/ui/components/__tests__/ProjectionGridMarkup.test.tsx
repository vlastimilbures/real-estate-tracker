// @vitest-environment jsdom
//
// The year-by-year grid's markup, pinned before its parallel header and cell lists become
// one column list: every header (with its metric links), every cell's formatting and the
// optional Purchases, Undrawn and extra columns, for the seed and the mixed portfolios.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProjectionGrid } from "../ProjectionGrid";
import { portfolioProjection } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { projectionSeries } from "../../model/projection";

/** Markup with React's generated ids (render-order counters) named alike. */
function html(el: Element): string {
  return el.innerHTML.replace(/«[^»]+»|:r[0-9a-z]+:/g, "«id»");
}

function grid(p: typeof portfolio, mode: "nominal" | "real") {
  const rows = projectionSeries(
    portfolioProjection(p, assumptions),
    mode,
    assumptions,
  );
  const { container } = render(
    <ProjectionGrid rows={rows} baseDate={assumptions.baseDate} />,
  );
  return container.querySelector("table")!;
}

describe("ProjectionGrid markup", () => {
  it("seed portfolio, nominal", () => {
    expect(html(grid(portfolio, "nominal"))).toMatchSnapshot();
  });

  it("mixed portfolio (purchases, undrawn and extra columns), real", () => {
    const table = grid(mixed, "real");
    // The fixture shows every optional column, so the pin covers them.
    expect(table.querySelectorAll("thead th").length).toBeGreaterThan(17);
    expect(html(table)).toMatchSnapshot();
  });
});
