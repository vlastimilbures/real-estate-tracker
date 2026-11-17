// Layout assertions for the Dashboard and the KPI band it shares with Property detail.
import { expect, panel, type Ux } from "../helpers";
import { expectNotClipped } from "./common";

/** At 1280 px and wider, a tile with a health marker keeps its label on one line: the
 *  band word sits in the foot, not beside the label (ADR 0195). */
export async function expectBandTileLabelsOneLine(ux: Ux) {
  if ((ux.page.viewportSize()?.width ?? 0) < 1280) return;
  const labels = ux.page.locator(".tile:has(.foot .health-marker) .label");
  await expect(labels.first()).toBeVisible();
  for (const label of await labels.all()) {
    const lines = await label.evaluate((el) => {
      const size = parseFloat(getComputedStyle(el).fontSize);
      return el.getBoundingClientRect().height / (size * 1.25);
    });
    expect(lines, await label.innerText()).toBeLessThan(1.5);
  }
}

/** The KPI strip (ADR 0200 §4): six tiles, one row when the strip is at least 960 px
 *  wide (the 1200 × 800 default window is three by two), nothing cut off, and at most
 *  `maxHeight` tall in one row: 96 px, more only where a foot carries a note. */
/** The KPI band (ADR 0200, 0222): one surface of captioned groups — the Dashboard's
 *  4 + 2 cells side by side from 960 px of band width (stacked below, the four in one
 *  row from 640 px), Property detail's six in one row from 960 px (three by two below);
 *  every label on one line, no value cut off, a cell at most `maxHeight` tall. */
export async function expectKpiStrip(ux: Ux, maxHeight = 96) {
  const m = await ux.page.locator(".kpi-band").evaluate((band) => {
    const groups = Array.from(
      band.querySelectorAll<HTMLElement>(":scope > [role=group]"),
    );
    return {
      width: band.getBoundingClientRect().width,
      groupTops: groups.map((g) => Math.round(g.getBoundingClientRect().top)),
      groups: groups.map((g) => {
        const caption = g.querySelector(".kpi-band-caption")!;
        const tiles = Array.from(g.querySelectorAll<HTMLElement>(".tile"));
        const cells = g.querySelector<HTMLElement>(".kpi-band-cells")!;
        return {
          // The cells stay inside their group, never painting over the next one.
          cellsFit: cells.scrollWidth <= g.clientWidth + 1,
          named: g.getAttribute("aria-labelledby") === caption.id,
          caption: caption.textContent ?? "",
          captionFits: caption.scrollWidth <= caption.clientWidth + 1,
          rows: new Set(
            tiles.map((t) => Math.round(t.getBoundingClientRect().top)),
          ).size,
          tiles: tiles.map((tile) => {
            const fits = (sel: string) => {
              const el = tile.querySelector<HTMLElement>(sel)!;
              return el.scrollWidth <= el.clientWidth + 1;
            };
            return {
              text: tile.querySelector(".label")?.textContent ?? "",
              height: tile.getBoundingClientRect().height,
              label: fits(":scope > .label"),
              value: fits(":scope > .value"),
            };
          }),
        };
      }),
    };
  });
  const counts = m.groups.map((g) => g.tiles.length);
  const wide = m.width >= 960;
  if (counts.length === 2) {
    expect(counts, "as-of and horizon cells").toEqual([4, 2]);
    expect(new Set(m.groupTops).size, "groups side by side").toBe(wide ? 1 : 2);
    expect(m.groups[0]!.rows, "as-of rows").toBe(m.width >= 640 ? 1 : 2);
    expect(m.groups[1]!.rows, "horizon rows").toBe(1);
  } else {
    expect(counts, "one group of six").toEqual([6]);
    expect(m.groups[0]!.rows, "rows").toBe(wide ? 1 : 2);
  }
  for (const g of m.groups) {
    expect(g.named, `group "${g.caption}" named by its caption`).toBe(true);
    expect(g.caption.length, "caption text").toBeGreaterThan(0);
    expect(g.captionFits, `caption "${g.caption}" on one line`).toBe(true);
    expect(g.cellsFit, `cells of "${g.caption}" inside their group`).toBe(true);
    for (const t of g.tiles) {
      expect(t.label, `label "${t.text}" on one line`).toBe(true);
      expect(t.value, `value of "${t.text}" not cut off`).toBe(true);
      if (wide)
        expect(t.height, `"${t.text}" cell height`).toBeLessThanOrEqual(
          maxHeight,
        );
    }
  }
}

/**
 * The key figures (ADR 0208): three groups. At 1280 px and wider, Returns and Cash flow
 * side by side, Debt straight under Returns, and a row's label and value at most 480 px
 * apart; one column at 900 px. Every label's text ends at least 8 px before its value.
 */
export async function expectKeyFigures(ux: Ux) {
  const p = panel(ux, ux.t.dashboard.kpiTitle);
  const m = await p.evaluate((el) => {
    const groups = Array.from(el.querySelectorAll(".kpi-group"), (g) =>
      g.getBoundingClientRect(),
    );
    const rows = Array.from(el.querySelectorAll(".statlist .k"), (k) => {
      const kr = k.getBoundingClientRect();
      const v = k.nextElementSibling as Element;
      const vr = v.getBoundingClientRect();
      // The text itself, not the cell: the cells always meet.
      const text = (node: Element) => {
        const r = document.createRange();
        r.selectNodeContents(node);
        return Array.from(r.getClientRects());
      };
      const labelRight = Math.max(...text(k).map((r) => r.right));
      const valueLeft = Math.min(...text(v).map((r) => r.left));
      return { span: vr.right - kr.left, clear: valueLeft - labelRight };
    });
    return {
      groups: groups.map((g) => ({
        top: Math.round(g.top),
        bottom: Math.round(g.bottom),
        left: Math.round(g.left),
      })),
      rows,
    };
  });
  const width = ux.page.viewportSize()!.width;
  const [returns, cashFlow, debt] = m.groups;
  expect(m.groups, "three groups").toHaveLength(3);
  if (width >= 1280) {
    expect(returns.top, "Returns and Cash flow side by side").toBe(
      cashFlow.top,
    );
    expect(debt.left, "Debt under Returns").toBe(returns.left);
    expect(debt.top, "Debt straight under Returns").toBeLessThan(
      returns.bottom + 24,
    );
    for (const r of m.rows)
      expect(r.span, "label to value").toBeLessThanOrEqual(480);
  } else if (width <= 900) {
    expect(cashFlow.top, "one column").toBeGreaterThan(returns.top);
  }
  for (const r of m.rows)
    expect(r.clear, "label clear of its value").toBeGreaterThanOrEqual(8);
}

/** The Dashboard's projection (ADR 0218 §2–§3): six charts, two per row from a 640 px
 *  grid (else one per row), each row full, Financing after them; at 1280 × 800 the first
 *  chart row ends inside the first viewport. No warning sits in the filter bar (§1). */
export async function expectDashboardHierarchy(ux: Ux) {
  const vp = ux.page.viewportSize()!;
  const financingTop = await panel(ux, ux.t.dashboard.financingTitle).evaluate(
    (el) => el.getBoundingClientRect().top + window.scrollY,
  );
  const m = await ux.page.evaluate(() => {
    const grid = document.querySelector(".projection-charts .chart-grid")!;
    const g = grid.getBoundingClientRect();
    const rows = new Map<
      number,
      { left: number; right: number; cards: number; bottom: number }
    >();
    for (const card of Array.from(grid.children)) {
      const r = card.getBoundingClientRect();
      const key = Math.round(r.top);
      const row = rows.get(key) ?? {
        left: Infinity,
        right: -Infinity,
        cards: 0,
        bottom: 0,
      };
      rows.set(key, {
        left: Math.min(row.left, r.left),
        right: Math.max(row.right, r.right),
        cards: row.cards + 1,
        bottom: Math.max(row.bottom, r.bottom + window.scrollY),
      });
    }
    return {
      gridLeft: g.left,
      gridRight: g.right,
      gridWidth: g.width,
      gridBottom: g.bottom + window.scrollY,
      cards: grid.children.length,
      rows: Array.from(rows.values()),
      barButtons: document.querySelectorAll(".filter-bar .asof-foot button")
        .length,
    };
  });
  expect(m.cards, "six charts").toBe(6);
  expect(
    m.rows.map((r) => r.cards),
    `cards per row at a ${Math.round(m.gridWidth)} px grid`,
  ).toEqual(m.gridWidth >= 640 ? [2, 2, 2] : [1, 1, 1, 1, 1, 1]);
  for (const r of m.rows) {
    expect(r.left, "chart row starts at the grid's left").toBeLessThanOrEqual(
      m.gridLeft + 1,
    );
    expect(r.right, "chart row has no empty cell").toBeGreaterThanOrEqual(
      m.gridRight - 1,
    );
  }
  expect(financingTop, "Financing after the charts").toBeGreaterThan(
    m.gridBottom,
  );
  expect(m.barButtons, "no button on the filter bar's hint row").toBe(0);
  if (vp.width === 1280 && vp.height === 800) {
    expect(
      m.rows[0]!.bottom,
      "first chart row inside the first viewport",
    ).toBeLessThanOrEqual(800);
  }
}

/** Financing & upcoming (ADR 0204): no row text clipped, and at 1280 × 800 with the
 *  sample the panel fits about 280 px with all three fixation ends listed. */
export async function expectFinancingTimeline(
  ux: Ux,
  rows?: number,
  maxHeight?: number,
) {
  const f = panel(ux, ux.t.dashboard.financingTitle);
  const list = f.getByRole("list", {
    name: ux.t.dashboard.financingTimeline(3),
  });
  if (rows !== undefined)
    await expect(list.getByRole("listitem")).toHaveCount(rows);
  for (const line of await f.locator(".fx-line, .fx-figure").all())
    await expectNotClipped(line);
  const vp = ux.page.viewportSize()!;
  if (vp.width === 1280 && maxHeight !== undefined) {
    const h = await f.evaluate((el) => el.getBoundingClientRect().height);
    expect(h, "Financing & upcoming height").toBeLessThanOrEqual(maxHeight);
  }
}
