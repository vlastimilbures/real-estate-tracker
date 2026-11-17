// Layout assertions for the other pages: Properties, Property detail, Projections,
// Scenarios, Import and Settings.
import type { Locator } from "@playwright/test";
import { expect, panel, type Ux } from "../helpers";
import { expectNotClipped } from "./common";

/** Properties list (ADR 0205): at 1280 px and wider the table has no horizontal scroll
 *  and its one-line rows are at most about 44 px; in a narrower window LTV, Net cash
 *  flow, DSCR and Value stay clear of the pinned actions. LTV and DSCR are figures with a
 *  health marker, not pills. */
export async function expectPropertiesFit(ux: Ux) {
  const table = ux.page.locator("table.data");
  expect(
    await table
      .locator("tbody .badge.good, tbody .badge.warn, tbody .badge.bad")
      .count(),
  ).toBe(0);
  const vp = ux.page.viewportSize()!;
  if (vp.width >= 1280) {
    await expectNotClipped(ux.page.locator(".table-wrap").first());
    const tall = await table.locator("tbody tr").evaluateAll((rows) =>
      rows
        .filter((r) => !r.querySelector(".cell-sub"))
        .map((r) => r.getBoundingClientRect().height)
        .filter((h) => h > 46),
    );
    expect(tall, "one-line rows taller than 46 px").toEqual([]);
  } else {
    const actions = await ux.page.locator("th.actions-col").boundingBox();
    for (const col of [
      ux.t.properties.colLtv,
      ux.t.properties.colNetCashFlow,
      ux.t.properties.colDscr,
      ux.t.properties.colValue,
    ]) {
      const box = await ux.page
        .getByRole("columnheader", { name: col, exact: true })
        .boundingBox();
      expect(
        box!.x + box!.width,
        `${col} clear of the actions`,
      ).toBeLessThanOrEqual(actions!.x + 1);
    }
  }
}

/** Property detail's top bar (ADR 0215): "Properties ›" and the title on one line and
 *  the actions on one line (1280 × 800 and 900 × 600); at 1280 px and wider the actions
 *  beside the title and the section tabs on one row. */
export async function expectPropertyTopBar(ux: Ux) {
  const bar = ux.page.locator("header.topbar");
  await expect(
    bar.getByRole("link", { name: ux.t.nav.properties, exact: true }),
  ).toBeVisible();
  const m = await bar.evaluate((el) => {
    const title = el.querySelector(".page-title-row")!.getBoundingClientRect();
    const h1 = getComputedStyle(el.querySelector("h1")!);
    const actions = el.querySelector(":scope > .row")!;
    // Items whose vertical centres lie within 4 px share a line.
    const mids = Array.from(actions.children)
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .map((r) => r.top + r.height / 2)
      .sort((a, b) => a - b);
    const lines = mids.filter((m, i) => i === 0 || m - mids[i - 1]! > 4);
    const nav = el.querySelector(
      ".topbar-subnav [role=list], .topbar-subnav ul",
    );
    const tabs = nav
      ? Array.from(nav.children).map((c) =>
          Math.round(c.getBoundingClientRect().top),
        )
      : [];
    return {
      titleHeight: title.height,
      line: parseFloat(h1.lineHeight) || parseFloat(h1.fontSize) * 1.3,
      actionRows: lines.length,
      beside: actions.getBoundingClientRect().top < title.bottom,
      tabRows: new Set(tabs).size,
    };
  });
  expect(m.titleHeight, "breadcrumb and title on one line").toBeLessThan(
    m.line * 1.5,
  );
  expect(m.actionRows, "actions on one line").toBe(1);
  if ((ux.page.viewportSize()?.width ?? 0) >= 1280) {
    expect(m.beside, "actions beside the title").toBe(true);
    expect(m.tabRows, "section tabs on one row").toBe(1);
  }
}

/** The year-by-year grid (ADR 0211): no Period column, 31 rows in under 1,000 px, and at
 *  1280 px wide at least 12 figure columns fully in view. */
export async function expectProjectionGrid(ux: Ux) {
  const m = await ux.page
    .locator(".table-wrap:has(table.data.compact)")
    .first()
    .evaluate((wrap) => {
      const box = wrap.getBoundingClientRect();
      const heads = Array.from(
        wrap.querySelectorAll<HTMLElement>("thead th:not(.sticky-col)"),
      );
      const rows = Array.from(wrap.querySelectorAll("tbody tr"));
      return {
        heads: heads.map((h) => h.textContent ?? ""),
        visible: heads.filter((h) => {
          const r = h.getBoundingClientRect();
          return r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
        }).length,
        rows: rows.length,
        scrolled: wrap.scrollLeft,
        height: rows.reduce((n, r) => n + r.getBoundingClientRect().height, 0),
      };
    });
  expect(m.heads, "no Period column").not.toContain(ux.t.projGrid.period);
  expect(m.rows).toBe(31);
  expect(m.height, "31 rows").toBeLessThanOrEqual(1000);
  expect(m.scrolled, "grid not scrolled").toBe(0);
  if ((ux.page.viewportSize()?.width ?? 0) >= 1280)
    expect(m.visible, "figure columns in view").toBeGreaterThanOrEqual(12);
}

/** Scenarios (ADR 0220): one panel above the compare; its head holds the count, the info
 *  "Add from preset" on one row at 1280 px, nothing cut off at any width; the presets
 *  open above the list, with their info icon beside the sub-heading. */
export async function expectScenariosPanel(
  ux: Ux,
  open: boolean,
  compared: number,
) {
  const sc = ux.t.scenarios;
  const p = panel(ux, sc.listTitle);
  const head = p.locator(".panel-head");
  await expect(head.locator(".hint")).toHaveText(sc.comparedOf(compared, 3));
  const toggle = head.getByRole("button", { name: sc.addFromPreset });
  await expect(toggle).toHaveAttribute("aria-expanded", String(open));
  await expectNotClipped(head);
  const m = await p.evaluate((el) => {
    const head = el.querySelector(".panel-head")!;
    const mids = Array.from(head.children).map((c) => {
      const r = c.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const list = el.querySelector(".scenario-list")!.getBoundingClientRect();
    const drawer = el.querySelector(".preset-drawer")!.getBoundingClientRect();
    return {
      oneRow: Math.max(...mids) - Math.min(...mids) <= 4,
      drawerAbove: drawer.height === 0 || drawer.bottom <= list.top,
      panelsAbove: Array.from(
        document.querySelectorAll("main section.panel"),
      ).indexOf(el),
    };
  });
  if ((ux.page.viewportSize()?.width ?? 0) >= 1280)
    expect(m.oneRow, "panel head on one row").toBe(true);
  expect(m.drawerAbove, "presets above the list").toBe(true);
  expect(m.panelsAbove, "the first panel on the page").toBe(0);
  if (open)
    await expect(
      p.locator(".preset-drawer .subhead-row").getByRole("button", {
        name: `${ux.t.common.aboutThis}: ${sc.presetsTitle}`,
      }),
    ).toBeVisible();
}

/** One grid for the scenario list: actions line up across rows and the summary stays
 *  readable in every language (ADR 0158). */
export async function expectScenarioGrid(ux: Ux) {
  const xs: number[] = [];
  for (const row of await ux.page.locator(".scenario-row").all()) {
    xs.push((await row.locator(".scenario-actions").boundingBox())!.x);
    const summary = await row.locator(".scenario-summary").boundingBox();
    expect(summary!.width, "scenario summary width").toBeGreaterThanOrEqual(
      200,
    );
  }
  for (const x of xs) expect(Math.abs(x - xs[0]!)).toBeLessThanOrEqual(1);
}

/** Scenario compare (ADR 0216): every row of charts is full (three in one row when the
 *  row is 900 px or wider), and the key-figures table runs to its panel's edges. */
export async function expectCompareLayout(ux: Ux) {
  await expect(ux.page.locator(".chart-grid.trio")).toBeVisible();
  await expect(ux.page.locator("table.compare-table")).toBeVisible();
  const m = await ux.page.evaluate(() => {
    const grid = document.querySelector(".chart-grid.trio")!;
    const g = grid.getBoundingClientRect();
    const rows = new Map<number, { left: number; right: number }>();
    for (const card of Array.from(grid.children)) {
      const r = card.getBoundingClientRect();
      const key = Math.round(r.top);
      const row = rows.get(key) ?? { left: Infinity, right: -Infinity };
      rows.set(key, {
        left: Math.min(row.left, r.left),
        right: Math.max(row.right, r.right),
      });
    }
    const wrap = document
      .querySelector("table.compare-table")!
      .closest(".table-wrap")!
      .getBoundingClientRect();
    const panel = document
      .querySelector("table.compare-table")!
      .closest("section.panel")!
      .getBoundingClientRect();
    return {
      width: g.width,
      rows: Array.from(rows.values()).map((r) => ({
        gapLeft: r.left - g.left,
        gapRight: g.right - r.right,
      })),
      insetLeft: wrap.left - panel.left,
      insetRight: panel.right - wrap.right,
      // A figure wider than its column would spill into the next one.
      overflowing: Array.from(
        document.querySelectorAll<HTMLElement>("table.compare-table tbody td"),
      )
        .filter((td) => td.scrollWidth > td.clientWidth + 1)
        .map((td) => td.textContent),
    };
  });
  if (m.width >= 900) expect(m.rows, "charts in one row").toHaveLength(1);
  for (const r of m.rows) {
    expect(r.gapLeft, "chart row starts at the grid's edge").toBeLessThan(1);
    expect(r.gapRight, "chart row ends at the grid's edge").toBeLessThan(1);
  }
  expect(m.insetLeft, "key figures flush left").toBeLessThanOrEqual(2);
  expect(m.insetRight, "key figures flush right").toBeLessThanOrEqual(2);
  expect(m.overflowing, "key figures fit their columns").toEqual([]);
}

/** Import (ADR 0212): the four file rows take at most 300 px; with a file chosen, the
 *  Import panel with its preview starts in the first viewport at 1280 × 800. */
export async function expectImportRows(ux: Ux, chosen = false) {
  const rows = ux.page.locator(".import-rows");
  await expect(rows.locator(":scope > li")).toHaveCount(4);
  const box = (await rows.boundingBox())!;
  expect(box.height, "four file rows").toBeLessThanOrEqual(300);
  const vp = ux.page.viewportSize()!;
  if (chosen && vp.width >= 1280) {
    const head = ux.page.getByRole("heading", {
      name: ux.t.importPage.importTitle,
      exact: true,
      level: 2,
    });
    const top = (await head.boundingBox())!.y;
    expect(top, "Import panel in the first viewport").toBeLessThan(vp.height);
  }
}

/** Settings (ADR 0221): the tabs in the top bar's section row; on Assumptions the state
 *  text, Discard and Save in the top bar's actions, nothing cut off; no floating row. */
export async function expectSettingsTopBar(
  ux: Ux,
  tab: "assumptions" | "backup",
) {
  const bar = ux.page.locator("header.topbar");
  const tabs = bar.locator(".topbar-subnav").getByRole("tablist");
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await expect(
    tabs.getByRole("tab", { name: ux.t.settings.tabs[tab] }),
  ).toHaveAttribute("aria-selected", "true");
  await expectNotClipped(tabs);
  const save = bar.getByRole("button", { name: ux.t.common.saveChanges });
  if (tab === "assumptions") {
    await expect(save).toBeVisible();
    await expectNotClipped(bar.locator(".topbar-form-actions"));
  } else {
    await expect(save).toHaveCount(0);
  }
  await expect(
    ux.page.locator(".sticky-actions, .settings-layout"),
  ).toHaveCount(0);
}

/** The Data check (ADR 0223): the counts as pills on a line under the head, nothing cut
 *  off; a block per list, side by side when both show on an 880 px container, stacked
 *  below; in a block of 680 px or more each row's fix sits right of its problem. */
export async function expectDataCheckLayout(p: Locator) {
  const counts = p.locator(".panel-badges");
  await expect(counts.locator(".dc-pill").first()).toBeVisible();
  await expectNotClipped(counts);
  const m = await p.evaluate((el) => {
    const wrap = el.querySelector(".dc-blocks-wrap");
    const blocks = Array.from(el.querySelectorAll<HTMLElement>(".dc-block"));
    return {
      wrapWidth: wrap?.getBoundingClientRect().width ?? 0,
      tops: blocks.map((b) => Math.round(b.getBoundingClientRect().top)),
      rows: blocks.flatMap((b) =>
        Array.from(b.querySelectorAll(".dc-row"), (r) => {
          const problem = r
            .querySelector(".dc-problem")!
            .getBoundingClientRect();
          const actions = r
            .querySelector(".dc-row-actions")!
            .getBoundingClientRect();
          return {
            // The container query measures the content box.
            wide: b.clientWidth >= 680,
            right: actions.left >= problem.right - 1,
            fits: r.scrollWidth <= r.clientWidth + 1,
          };
        }),
      ),
    };
  });
  if (m.tops.length === 2)
    expect(new Set(m.tops).size, "blocks side by side").toBe(
      m.wrapWidth >= 880 ? 1 : 2,
    );
  for (const r of m.rows) {
    expect(r.fits, "row not cut off").toBe(true);
    if (r.wide) expect(r.right, "the fix right of its problem").toBe(true);
  }
}
