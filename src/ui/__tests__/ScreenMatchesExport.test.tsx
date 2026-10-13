// @vitest-environment jsdom
//
// UX-062 (#174): the projection grid and the amortization table export what they show.
// Every exported cell, read back with the screen's formatter, equals the cell on screen.
import { describe, it, expect, beforeEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { ProjectionGrid } from "../components/ProjectionGrid";
import { AmortizationTable } from "../pages/PropertyDetailPanels";
import { useUiStore } from "../../state/uiStore";
import { getDict } from "../../i18n";
import {
  portfolioProjection,
  propertySchedules,
  type AmortizationRow,
  type Portfolio,
} from "../../engine";
import { assumptions, portfolio } from "../../engine/__tests__/support/seed";
import { withEvents } from "../../engine/__tests__/support/events";
import { mixed } from "../../engine/__tests__/support/mixed";
import { D } from "../../lib/money";
import { fmtCzk, fmtDate, fmtDscr, fmtPct } from "../../lib/format";
import { projectionColumns, projectionSeries } from "../model/projection";
import { amortizationColumns } from "../model/propertyDetail";
import {
  cellKind,
  cellValue,
  type CellKind,
  type XlsxColumn,
} from "../model/xlsxExport";

const en = getDict("en");

beforeEach(() => {
  cleanup();
  act(() => useUiStore.setState({ language: "en" }));
});

/** An exported cell as the screen formats it; a money cell in either sign style. */
function shown(
  kind: CellKind,
  written: ReturnType<typeof cellValue>,
): string[] {
  if (written === null) return ["—", en.common.notApplicable];
  if (written instanceof Date) return [fmtDate(written)];
  if (typeof written === "string") return [written];
  const n = D(written);
  switch (kind) {
    case "money":
      return [true, false].map((parens) =>
        fmtCzk(n, { parens, suffix: false }),
      );
    case "percent":
      return [fmtPct(n, 1)];
    case "rate":
      return [fmtPct(n, 2)];
    case "multiple":
      return [fmtDscr(n)];
    default:
      return [String(written)];
  }
}

/** Each body row's cell texts against the exported row read back. */
function expectScreenMatchesExport<R>(
  table: HTMLTableElement,
  columns: XlsxColumn<R>[],
  rows: R[],
) {
  const body = [...table.tBodies[0]!.rows];
  expect(body).toHaveLength(rows.length);
  expect([...table.tHead!.rows[0]!.cells].map((c) => c.textContent)).toEqual(
    columns.map((c) => c.header),
  );
  body.forEach((tr, i) => {
    columns.forEach((c, j) => {
      const text = tr.cells[j]!.textContent;
      // The Year cell reads "Year n · yyyy"; the export keeps the calendar year.
      const onScreen = j === 0 ? text.split(" · ").at(-1)! : text;
      const kind = cellKind(c, rows[i]!);
      const written = cellValue(kind, c.value(rows[i]!));
      expect(shown(kind, written), `row ${i}, ${c.header}`).toContain(onScreen);
    });
  });
}

const fixtures: [string, Portfolio][] = [
  ["the seed", portfolio],
  ["loan events and a development loan", withEvents(mixed)],
];

describe("the projection grid matches its export", () => {
  for (const [name, p] of fixtures) {
    for (const mode of ["nominal", "real"] as const) {
      it(`${name}, ${mode}`, () => {
        const rows = projectionSeries(
          portfolioProjection(p, assumptions),
          mode,
          assumptions,
        );
        const { container } = render(
          <ProjectionGrid rows={rows} baseDate={assumptions.baseDate} />,
        );
        expectScreenMatchesExport(
          container.querySelector("table")!,
          projectionColumns(en, assumptions.baseDate, rows),
          rows,
        );
      });
    }
  }

  it("a DSCR above the cap reads >99,00x on screen; the export keeps the number (D-35)", () => {
    const [, year1] = portfolioProjection(portfolio, assumptions);
    const rows = [{ ...year1!, dscr: D(150) }];
    const { container } = render(
      <ProjectionGrid rows={rows} baseDate={assumptions.baseDate} />,
    );
    const columns = projectionColumns(en, assumptions.baseDate, rows);
    const j = columns.findIndex((c) => c.kind === "multiple");
    const cell = container.querySelector("tbody tr")!.children[j]!;
    expect(cell.textContent).toBe(fmtDscr(D(150)));
    expect(cell.textContent).toMatch(/^>/);
    expect(cellValue("multiple", columns[j]!.value(rows[0]!))).toBe(150);
  });
});

describe("the amortization table matches its export", () => {
  const schedule = (p: Portfolio, id: string): AmortizationRow[] =>
    propertySchedules(
      p.mortgages.filter((m) => m.propertyId === id),
      [id],
      assumptions,
    ).get(id)!.rows;

  for (const [name, p, id] of [
    ["the seed", portfolio, "javorova"],
    ["loan events", withEvents(portfolio), "javorova"],
    ["a development loan with events", withEvents(mixed), "dev"],
  ] as const) {
    it(name, () => {
      const rows = schedule(p, id);
      const { container } = render(<AmortizationTable schedule={rows} />);
      expectScreenMatchesExport(
        container.querySelector("table")!,
        amortizationColumns(en, rows),
        rows,
      );
    });
  }
});
