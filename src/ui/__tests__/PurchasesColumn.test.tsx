// @vitest-environment jsdom
//
// #317 (ADR 0194): the projection grid and its export show a future purchase's value in
// its purchase year (`acquiredValue`, ADR 0165), in a Purchases column right after Value.
// Shown only when some year holds one; blank in the opening row; deflated under Real.
import { beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { ProjectionGrid } from "../components/ProjectionGrid";
import { useUiStore } from "../../state/uiStore";
import { portfolioProjection, type Portfolio } from "../../engine";
import { assumptions, portfolio } from "../../engine/__tests__/support/seed";
import { mixed } from "../../engine/__tests__/support/mixed";
import { projectionColumns, projectionSeries } from "../model/projection";
import { en } from "../../i18n/en";
import type { Mode } from "../model/lens";

const g = en.projGrid;
const series = (p: Portfolio, mode: Mode) =>
  projectionSeries(portfolioProjection(p, assumptions), mode, assumptions);
const headers = (p: Portfolio, mode: Mode = "nominal") =>
  projectionColumns(en, assumptions.baseDate, series(p, mode)).map(
    (c) => c.header,
  );
const gridHeaders = (p: Portfolio) => {
  const { container } = render(
    <ProjectionGrid
      rows={series(p, "nominal")}
      baseDate={assumptions.baseDate}
    />,
  );
  return [...container.querySelectorAll("thead th")].map(
    (th) => th.textContent,
  );
};

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Purchases column (#317)", () => {
  it("is absent when no future purchase lands in the horizon", () => {
    expect(headers(portfolio)).not.toContain(g.purchases);
    expect(gridHeaders(portfolio)).not.toContain(g.purchases);
  });

  it("follows Value, on screen and in the export", () => {
    for (const h of [headers(mixed), gridHeaders(mixed)]) {
      expect(h.indexOf(g.purchases)).toBe(h.indexOf(g.value) + 1);
    }
  });

  for (const mode of ["nominal", "real"] as const) {
    it(`holds the acquired value in the purchase year only, ${mode}`, () => {
      const rows = series(mixed, mode);
      const col = projectionColumns(en, assumptions.baseDate, rows).find(
        (c) => c.header === g.purchases,
      )!;
      expect(col.kind).toBe("money");
      expect(col.value(rows[0]!)).toBeNull();
      const bought = rows.filter((r) => !r.acquiredValue.isZero());
      expect(bought).toHaveLength(1);
      expect(col.value(bought[0]!)).toBe(bought[0]!.acquiredValue);
    });
  }

  it("is deflated under Real", () => {
    const nominal = series(mixed, "nominal").find(
      (r) => !r.acquiredValue.isZero(),
    )!;
    const real = series(mixed, "real")[nominal.year]!;
    expect(real.acquiredValue.lessThan(nominal.acquiredValue)).toBe(true);
  });

  it("dashes the opening row on screen", () => {
    const { container } = render(
      <ProjectionGrid
        rows={series(mixed, "nominal")}
        baseDate={assumptions.baseDate}
      />,
    );
    const h = [...container.querySelectorAll("thead th")].map(
      (th) => th.textContent,
    );
    const opening = container.querySelectorAll("tbody tr")[0]!;
    expect(
      opening.querySelectorAll("td")[h.indexOf(g.purchases)]!.textContent,
    ).toBe("—");
  });
});
