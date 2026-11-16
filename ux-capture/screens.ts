// Screen manifest for the UX capture run. One entry = one user-visible state; `run`
// drives the app there through the UI and calls `ux.capture(id)` (PNG + axe scan).
// To add a screen: add an entry here with a free id. The id's leading number groups
// screens by area (0x dashboard, 1x properties, 2x property detail, …); the order of
// this list is the flow order and need not match the file order.
import path from "node:path";
import type { Locator } from "@playwright/test";
import type { Route } from "../src/state/uiStore";
import {
  expect,
  addTwoPresetsAndCompare,
  nav,
  openFirstProperty,
  panel,
  settingsTab,
  boot,
  deleteAllProperties,
  expectNotClipped,
  expectPanelActionsRight,
  pickFiveYearsAndCheckHint,
  expectRowActions,
  expectRowActionTip,
  expectInfoTip,
  expectInfoTipEscape,
  type Ux,
} from "./helpers";

export interface Screen {
  id: string;
  /** What the capture shows (the test title in the capture run). */
  desc: string;
  run: (ux: Ux) => Promise<void>;
}

// Resolved from the repo root (the cwd of `pnpm ux:capture`).
const fixture = (name: string) => path.resolve("ux-capture", "fixtures", name);

type BackupTables = Record<string, Record<string, unknown>[]>;

/**
 * Settings → Backup: exports the sample, edits the file to a legacy 60-year fixation and a
 * 150-year horizon, and picks it for restore (ADR 0148).
 */
async function pickOutOfRangeBackup(ux: Ux) {
  await pickEditedBackup(ux, (tables) => {
    const [block] = tables.mortgage_blocks ?? [];
    const [assumptions] = tables.assumptions ?? [];
    if (!block || !assumptions) throw new Error("the sample has no mortgage");
    block.fixation_years = 60;
    assumptions.horizon_years = 150;
  });
}

/** Settings → Backup: exports the sample, edits the first property's purchase date to
 *  1850 (an earlier CSV import could store it), and picks it for restore (ADR 0149). */
async function pickEarlyDateBackup(ux: Ux) {
  await pickEditedBackup(ux, (tables) => {
    const [property] = tables.properties ?? [];
    if (!property) throw new Error("the sample has no property");
    property.purchase_date = "1850-01-01";
  });
}

/**
 * Settings → Backup: exports the sample, edits the file and picks it for restore. The
 * browser has no Tauri file dialog: the `open_backup_file` and `write_app_backup`
 * commands are answered the way the Rust side does, after boot (the database adapter
 * is chosen at boot).
 */
async function chooseEditedBackup(
  ux: Ux,
  edit: (tables: BackupTables) => void,
) {
  await boot(ux.page);
  await settingsTab(ux, "backup");
  const download = ux.page.waitForEvent("download");
  await ux.page.getByRole("button", { name: ux.t.backup.exportButton }).click();
  const file = await (await download).path();
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(file, "utf8")) as {
    tables: BackupTables;
  };
  edit(backup.tables);
  await ux.page.evaluate((text) => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: (cmd: string) =>
        cmd === "open_backup_file"
          ? Promise.resolve({ name: "portfolio-backup-legacy.json", text })
          : cmd === "write_app_backup"
            ? Promise.resolve()
            : Promise.reject(new Error(`no ${cmd} in the browser`)),
    };
  }, JSON.stringify(backup));
  await ux.page.getByRole("button", { name: ux.t.backup.chooseFile }).click();
}

/** `chooseEditedBackup` up to the confirm step that asks to restore anyway. */
async function pickEditedBackup(ux: Ux, edit: (tables: BackupTables) => void) {
  await chooseEditedBackup(ux, edit);
  await expect(
    ux.page.getByRole("button", { name: ux.t.backup.restoreAnyway }),
  ).toBeVisible();
  // The export's toast would cover the confirm step.
  await expect(ux.page.getByText(ux.t.backup.downloaded)).toBeHidden();
}

/**
 * The startup error screen for a forced failure (ADR 0153): src/data/e2eFaults.ts reads
 * `sessionStorage["e2e.fault"]` in the browser E2E build, and the data layer then refuses
 * the database for real.
 */
async function bootFailing(ux: Ux, fault: "DB_NEWER" | "ROW_INVALID") {
  await ux.page.addInitScript(
    (f) => sessionStorage.setItem("e2e.fault", f),
    fault,
  );
  await ux.page.goto("/");
  await expect(ux.page.locator(".error-screen")).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * ROW_INVALID, then Restore a backup… up to its confirm step. The backup is an export of
 * the sample, taken first in a normal start; the reload then starts with the fault. The
 * browser has no Tauri file dialog, so `open_backup_file` and `write_app_backup` are
 * answered the way the Rust side does.
 */
async function bootRestoreConfirm(ux: Ux) {
  await boot(ux.page);
  await settingsTab(ux, "backup");
  const download = ux.page.waitForEvent("download");
  await ux.page.getByRole("button", { name: ux.t.backup.exportButton }).click();
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(await (await download).path(), "utf8");
  await ux.page.addInitScript(() =>
    sessionStorage.setItem("e2e.fault", "ROW_INVALID"),
  );
  await ux.page.reload();
  await expect(ux.page.locator(".error-screen")).toBeVisible({
    timeout: 30_000,
  });
  await ux.page.evaluate((json) => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: (cmd: string) =>
        cmd === "open_backup_file"
          ? Promise.resolve({ name: "portfolio-backup.json", text: json })
          : cmd === "write_app_backup"
            ? Promise.resolve()
            : Promise.reject(new Error(`no ${cmd} in the browser`)),
    };
  }, text);
  await ux.page.getByRole("button", { name: ux.t.boot.restoreBackup }).click();
  await expect(
    ux.page.getByRole("button", { name: ux.t.backup.restoreNow }),
  ).toBeVisible();
}

/**
 * Opens the first property's first mortgage block for editing and enters two
 * prepayments (the second larger than the balance) and a maturity change (ADR 0116).
 */
async function enterLoanEvents(ux: Ux) {
  await boot(ux.page);
  await openFirstProperty(ux);
  const d = ux.t.propertyDetail;
  const p = panel(ux, d.mortgagesTitle);
  await p.getByRole("button", { name: ux.t.common.edit }).first().click();
  const add = p.getByRole("button", { name: d.eventAddPrepayment });
  const rows: [string, string][] = [
    ["17.01.2031", "500000"],
    ["17.01.2040", "5000000"],
  ];
  for (const [i, [date, amount]] of rows.entries()) {
    await add.click();
    const row = p.getByRole("group", { name: d.eventPrepaymentRow(i + 1) });
    await row.getByLabel(d.eventDate, { exact: true }).fill(date);
    await row.getByLabel(d.eventAmount).fill(amount);
  }
  await p
    .getByRole("group", { name: d.eventPrepaymentRow(1) })
    .getByLabel(d.eventFee)
    .fill("2000");
  await p.getByRole("button", { name: d.eventAddRecast }).click();
  const recast = p.getByRole("group", { name: d.eventRecastRow(1) });
  await recast.getByLabel(d.eventDate, { exact: true }).fill("17.01.2033");
  await recast.getByLabel(d.eventMaturity).fill("17.01.2045");
  return p;
}

/**
 * In the open property dialog, opens the Acquisition section and fills the given
 * funding fields (ADR 0119 §9).
 */
async function fillFunding(
  ux: Ux,
  values: Partial<
    Record<
      "ownCash" | "transactionCosts" | "initialWorks" | "fundingNote",
      string
    >
  >,
) {
  const dialog = ux.page.getByRole("dialog");
  const f = ux.t.propertyForm;
  const toggle = dialog.getByRole("button", { name: f.acquisitionSection });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  for (const [key, value] of Object.entries(values)) {
    await dialog
      .getByLabel(f[key as keyof typeof values], { exact: true })
      .fill(value);
  }
  return dialog;
}

/** Pick a property-select dropdown's trigger and check focus moved into the list. */
async function openDropdown(ux: Ux, trigger: Locator, focused: string) {
  await trigger.click();
  const list = ux.page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(list.getByRole("option", { name: focused })).toBeFocused();
}

/** At 1280 px and wider, a tile with a health marker keeps its label on one line: the
 *  band word sits in the foot, not beside the label (ADR 0195). */
async function expectBandTileLabelsOneLine(ux: Ux) {
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

/** Import (ADR 0212): the four file rows take at most 300 px; with a file chosen, the
 *  Import panel with its preview starts in the first viewport at 1280 × 800. */
async function expectImportRows(ux: Ux, chosen = false) {
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

/** The year-by-year grid (ADR 0211): no Period column, 31 rows in under 1,000 px, and at
 *  1280 px wide at least 12 figure columns fully in view. */
async function expectProjectionGrid(ux: Ux) {
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

/** Scenario compare (ADR 0216): every row of charts is full (three in one row when the
 *  row is 900 px or wider), and the key-figures table runs to its panel's edges. */
async function expectCompareLayout(ux: Ux) {
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

/** The KPI strip (ADR 0200 §4): six tiles, one row when the strip is at least 960 px
 *  wide (the 1200 × 800 default window is three by two), nothing cut off, and at most
 *  `maxHeight` tall in one row: 96 px, more only where a foot carries a note. */
async function expectKpiStrip(ux: Ux, maxHeight = 96) {
  const m = await ux.page.locator(".kpi-strip").evaluate((strip) => ({
    width: strip.getBoundingClientRect().width,
    tiles: Array.from(strip.children, (tile) => {
      const r = tile.getBoundingClientRect();
      const fits = (sel: string) => {
        const el = tile.querySelector<HTMLElement>(sel)!;
        return el.scrollWidth <= el.clientWidth + 1;
      };
      return {
        text: tile.querySelector(".label")?.textContent ?? "",
        top: Math.round(r.top),
        height: r.height,
        label: fits(":scope > .label"),
        value: fits(":scope > .value"),
      };
    }),
  }));
  expect(m.tiles).toHaveLength(6);
  const rows = new Set(m.tiles.map((t) => t.top)).size;
  expect(rows, "strip rows").toBe(m.width >= 960 ? 1 : 2);
  for (const t of m.tiles) {
    expect(t.label, `label "${t.text}" on one line`).toBe(true);
    expect(t.value, `value of "${t.text}" not cut off`).toBe(true);
    if (m.width >= 960)
      expect(t.height, `"${t.text}" tile height`).toBeLessThanOrEqual(
        maxHeight,
      );
  }
}

/** Property detail's top bar (ADR 0215): "Properties ›" and the title on one line and
 *  the actions on one line (1280 × 800 and 900 × 600); at 1280 px and wider the actions
 *  beside the title and the section tabs on one row. */
async function expectPropertyTopBar(ux: Ux) {
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

/**
 * The key figures (ADR 0208): three groups. At 1280 px and wider, Returns and Cash flow
 * side by side, Debt straight under Returns, and a row's label and value at most 480 px
 * apart; one column at 900 px. Every label's text ends at least 8 px before its value.
 */
async function expectKeyFigures(ux: Ux) {
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

/** The Dashboard's hierarchy (ADR 0202): at 1280 × 800 the hero chart ends inside the
 *  first viewport and Financing starts within the second; at every width each row of
 *  small multiples is full (no empty cell). */
async function expectDashboardHierarchy(ux: Ux) {
  const vp = ux.page.viewportSize()!;
  const financingTop = await panel(ux, ux.t.dashboard.financingTitle).evaluate(
    (el) => el.getBoundingClientRect().top + window.scrollY,
  );
  const m = await ux.page.evaluate(() => {
    const bottom = (el: Element | null) =>
      el ? el.getBoundingClientRect().bottom + window.scrollY : NaN;
    const grid = document.querySelector(".chart-grid.small")!;
    const g = grid.getBoundingClientRect();
    const rows = new Map<
      number,
      { left: number; right: number; cards: number }
    >();
    for (const card of Array.from(grid.children)) {
      const r = card.getBoundingClientRect();
      const key = Math.round(r.top);
      const row = rows.get(key) ?? {
        left: Infinity,
        right: -Infinity,
        cards: 0,
      };
      rows.set(key, {
        left: Math.min(row.left, r.left),
        right: Math.max(row.right, r.right),
        cards: row.cards + 1,
      });
    }
    return {
      heroBottom: bottom(document.querySelector(".chart-hero")),
      gridLeft: g.left,
      gridRight: g.right,
      gridWidth: g.width,
      cards: grid.children.length,
      rows: Array.from(rows.values()),
    };
  });
  // Three then two from 860 px, two-two-one from 640 px, one per row below (ADR 0202 §3).
  expect(m.cards, "five small multiples").toBe(5);
  expect(
    m.rows.map((r) => r.cards),
    `cards per row at a ${Math.round(m.gridWidth)} px grid`,
  ).toEqual(
    m.gridWidth >= 860
      ? [3, 2]
      : m.gridWidth >= 640
        ? [2, 2, 1]
        : [1, 1, 1, 1, 1],
  );
  for (const r of m.rows) {
    expect(r.left, "chart row starts at the grid's left").toBeLessThanOrEqual(
      m.gridLeft + 1,
    );
    expect(r.right, "chart row has no empty cell").toBeGreaterThanOrEqual(
      m.gridRight - 1,
    );
  }
  if (vp.width === 1280 && vp.height === 800) {
    expect(
      m.heroBottom,
      "hero chart inside the first viewport",
    ).toBeLessThanOrEqual(800);
    expect(financingTop, "Financing within the second viewport").toBeLessThan(
      1600,
    );
  }
}

/** Financing & upcoming (ADR 0204): no row text clipped, and at 1280 × 800 with the
 *  sample the panel fits about 280 px with all three fixation ends listed. */
async function expectFinancingTimeline(
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

/** Restores the sample as edited by `edit` (Settings → Backup), then the Dashboard. */
async function restoreEdited(ux: Ux, edit: (tables: BackupTables) => void) {
  await chooseEditedBackup(ux, edit);
  await ux.page.getByRole("button", { name: ux.t.backup.restoreNow }).click();
  await expect(
    ux.page.getByRole("button", { name: ux.t.backup.chooseFile }),
  ).toBeVisible();
  // The export's toast would cover the panel.
  await expect(ux.page.getByText(ux.t.backup.downloaded)).toBeHidden();
  await nav(ux, "dashboard");
}

const rowsOf = (tables: BackupTables, name: string) => {
  const rows = tables[name];
  if (!rows) throw new Error(`the backup has no ${name}`);
  return rows;
};

/** Twenty properties with a loan each: the sample's three and 17 copies of the first,
 *  their loans started a few months apart (synthetic names only). */
function twentyLoans(tables: BackupTables) {
  const properties = rowsOf(tables, "properties");
  const [first] = properties;
  if (!first) throw new Error("the sample has no property");
  const linked = ["valuations", "leases", "holding_costs", "mortgage_blocks"];
  const own = linked.map(
    (t) =>
      [t, rowsOf(tables, t).filter((r) => r.property_id === first.id)] as const,
  );
  for (let i = 1; i <= 17; i++) {
    const id = `ux-copy-${i}`;
    properties.push({
      ...first,
      id,
      name: `Byt Ukazkovy ${String(i).padStart(2, "0")}`,
    });
    for (const [t, rows] of own)
      for (const r of rows)
        rowsOf(tables, t).push({
          ...r,
          id: `${String(r.id)}-${i}`,
          property_id: id,
          ...(t === "mortgage_blocks"
            ? {
                start_date: `${2018 + (i % 8)}-${String(1 + ((i * 5) % 12)).padStart(2, "0")}-15`,
                prepayments: null,
                recasts: null,
              }
            : {}),
        });
  }
}

/** Byt Lipova's lease ends in the window with no next lease, and Byt Dubova's loan is a
 *  development loan with a draw and its completion ahead. */
function devLoanAndLeaseEnd(tables: BackupTables) {
  const idOf = (name: string) => {
    const p = rowsOf(tables, "properties").find((x) => x.name === name);
    if (!p) throw new Error(`the sample has no ${name}`);
    return p.id;
  };
  const lipova = idOf("Byt Lipova");
  const leases = rowsOf(tables, "leases")
    .filter((l) => l.property_id === lipova)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  const [current, next] = leases;
  if (!current || !next) throw new Error("Byt Lipova has no follow-on lease");
  tables.leases = rowsOf(tables, "leases").filter((l) => l !== next);
  current.end_date = "2027-06-30";
  const dubova = idOf("Byt Dubova");
  const block = rowsOf(tables, "mortgage_blocks").find(
    (b) => b.property_id === dubova,
  );
  if (!block) throw new Error("Byt Dubova has no loan");
  block.loan_term_years = 30;
  block.draws = JSON.stringify([{ date: "2027-03-01", amount: "500000" }]);
  block.interest_only_until = "2027-09-30";
}

/** Properties list (ADR 0205): at 1280 px and wider the table has no horizontal scroll
 *  and its one-line rows are at most about 44 px; in a narrower window LTV, Net cash
 *  flow, DSCR and Value stay clear of the pinned actions. LTV and DSCR are figures with a
 *  health marker, not pills. */
async function expectPropertiesFit(ux: Ux) {
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

/** Property detail of the first property: its first loan becomes a development loan with
 *  a tranche drawn and one ahead (ADR 0167), saved. */
async function firstLoanToDevelopment(ux: Ux) {
  const d = ux.t.propertyDetail;
  await boot(ux.page);
  await openFirstProperty(ux);
  const m = panel(ux, d.mortgagesTitle);
  await m.getByRole("button", { name: ux.t.common.edit }).first().click();
  await m.getByRole("button", { name: d.loanTypeDevelopment }).click();
  await m.getByLabel(d.fieldLoanTermYears, { exact: false }).fill("30");
  const schedule = m.getByRole("group", { name: d.fieldDraws });
  const tranches: [string, string][] = [
    ["01.09.2024", "400000"],
    ["01.03.2027", "500000"],
  ];
  for (const [i, [date, amount]] of tranches.entries()) {
    await schedule.getByRole("button", { name: d.addTranche }).click();
    const row = schedule.getByRole("group", { name: d.trancheRow(i + 1) });
    await row.getByLabel(d.eventDate, { exact: true }).fill(date);
    await row.getByLabel(d.eventAmount).fill(amount);
  }
  await m.getByRole("button", { name: ux.t.common.saveChanges }).click();
}

/** One disclosure (ADR 0203): no <details>, and every expandable button names a region
 *  that is in the DOM. */
async function expectDisclosures(ux: Ux) {
  expect(await ux.page.locator("details").count(), "no <details>").toBe(0);
  const missing = await ux.page.evaluate(() =>
    Array.from(document.querySelectorAll("button[aria-expanded]"))
      // Popup triggers (listbox, calendar) and the sidebar toggle are not disclosures.
      .filter(
        (b) =>
          !b.hasAttribute("aria-haspopup") &&
          !b.classList.contains("collapse-btn"),
      )
      .filter((b) => {
        const id = b.getAttribute("aria-controls");
        return !id || !document.getElementById(id);
      })
      .map((b) => b.textContent),
  );
  expect(missing, "disclosures without their region").toEqual([]);
}

/** One grid for the scenario list: actions line up across rows and the summary stays
 *  readable in every language (ADR 0158). */
async function expectScenarioGrid(ux: Ux) {
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

/** Owned properties added until Properties lists six: past five, the property selectors
 *  become dropdowns. */
async function addPropertiesToSix(ux: Ux) {
  await nav(ux, "properties");
  const rows = ux.page.locator("table.data tbody tr");
  const f = ux.t.propertyForm;
  for (let n = await rows.count(); n < 6; n++) {
    await ux.page
      .getByRole("button", { name: ux.t.properties.addProperty })
      .click();
    const dialog = ux.page.getByRole("dialog");
    await dialog.getByLabel(f.name, { exact: true }).fill(`Byt Nový ${n + 1}`);
    await dialog.getByLabel(f.purchaseDate, { exact: true }).fill("01.02.2024");
    await dialog.getByLabel(f.purchasePrice, { exact: true }).fill("4500000");
    await dialog
      .locator(".modal-foot")
      .getByRole("button", { name: f.addTitle })
      .click();
    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(n + 1);
  }
}

/** Saves the open property dialog and waits for it to close. */
async function saveProperty(ux: Ux) {
  const dialog = ux.page.getByRole("dialog");
  await dialog
    .locator(".modal-foot")
    .getByRole("button", { name: ux.t.common.saveChanges })
    .click();
  await expect(dialog).toBeHidden();
}

/** Topbar lens toggle → Real, and check it took (#137). */
async function pickReal(ux: Ux) {
  const real = ux.page
    .getByRole("group", { name: ux.t.shell.nominalOrReal })
    .getByRole("button", { name: ux.t.common.real, exact: true });
  await real.click();
  await expect(real).toHaveAttribute("aria-pressed", "true");
}

export const SCREENS: Screen[] = [
  {
    id: "00-loading",
    desc: "Startup loading screen (sql.js init delayed)",
    run: async (ux) => {
      // Hold the wasm download so the loading screen stays up long enough to capture.
      await ux.page.route("**/*.wasm*", async (r) => {
        await new Promise((res) => setTimeout(res, 4000));
        await r.continue();
      });
      await ux.page.goto("/");
      await expect(ux.page.locator(".loading-screen")).toBeVisible();
      await ux.capture("00-loading");
    },
  },
  {
    id: "00b-boot-row-invalid",
    desc: "Startup error: an unreadable record (Restore a backup…, records involved)",
    run: async (ux) => {
      await bootFailing(ux, "ROW_INVALID");
      await ux.capture("00b-boot-row-invalid");
    },
  },
  {
    id: "00c-boot-db-newer",
    desc: "Startup error: a database from a newer app (details, no Try again)",
    run: async (ux) => {
      await bootFailing(ux, "DB_NEWER");
      await ux.capture("00c-boot-db-newer");
    },
  },
  {
    id: "00d-boot-restore-confirm",
    desc: "Startup error: Restore a backup… at its confirm step",
    run: async (ux) => {
      await bootRestoreConfirm(ux);
      await ux.capture("00d-boot-restore-confirm");
    },
  },
  {
    id: "00e-boot-restored",
    desc: "Startup error: restored, the safety copy named, Open the app",
    run: async (ux) => {
      await bootRestoreConfirm(ux);
      await ux.page
        .getByRole("button", { name: ux.t.backup.restoreNow })
        .click();
      await expect(
        ux.page.getByRole("button", { name: ux.t.boot.continue }),
      ).toBeVisible();
      await ux.capture("00e-boot-restored");
    },
  },
  {
    id: "00f-boot-restored-app",
    desc: "After Continue: the app keeps naming the safety copy until dismissed (ADR 0154)",
    run: async (ux) => {
      await bootRestoreConfirm(ux);
      await ux.page
        .getByRole("button", { name: ux.t.backup.restoreNow })
        .click();
      await ux.page.getByRole("button", { name: ux.t.boot.continue }).click();
      await expect(
        ux.page.getByText(/portfolio-before-restore-.*\.json/),
      ).toBeVisible();
      await ux.capture("00f-boot-restored-app", { fullPage: false });
    },
  },
  {
    id: "01-dashboard",
    desc: "Dashboard, nominal, as of today",
    run: async (ux) => {
      await boot(ux.page);
      // The reset-window toggle shows every option, inside its panel head (ADR 0158).
      const head = panel(ux, ux.t.dashboard.financingTitle).locator(
        ".panel-head",
      );
      await expectNotClipped(head.locator(".segmented"));
      await expectNotClipped(head);
      await expectPanelActionsRight(ux.page);
      await expectBandTileLabelsOneLine(ux);
      await ux.capture("01-dashboard");
      // After the shot, so a failing layout still leaves its picture.
      await expectKpiStrip(ux);
      await expectDashboardHierarchy(ux);
      await expectFinancingTimeline(ux, 3, 300);
      await expectKeyFigures(ux);
    },
  },
  {
    id: "02-dashboard-real",
    desc: "Dashboard, real lens",
    run: async (ux) => {
      await boot(ux.page);
      await pickReal(ux);
      await ux.capture("02-dashboard-real");
      // After the shot, so a failing layout still leaves its picture.
      await expectKpiStrip(ux);
      await expectKeyFigures(ux);
    },
  },
  {
    id: "03-dashboard-asof-5y",
    desc: "Dashboard, as-of +5y preset",
    run: async (ux) => {
      await boot(ux.page);
      await pickFiveYearsAndCheckHint(ux.page);
      await ux.capture("03-dashboard-asof-5y");
      // After the shot, so a failing layout still leaves its picture.
      await expectKpiStrip(ux);
    },
  },
  {
    id: "03b-dashboard-real-asof-5y",
    desc: "Dashboard, real lens at +5y: the net worth foot names base-date Kč (ADR 0200 §4)",
    run: async (ux) => {
      await boot(ux.page);
      await pickReal(ux);
      await pickFiveYearsAndCheckHint(ux.page);
      await ux.capture("03b-dashboard-real-asof-5y");
      // The base-date note may take the net worth foot to a third line.
      await expectKpiStrip(ux, 112);
    },
  },
  {
    id: "04-dashboard-calendar",
    desc: "As-of calendar popover open",
    run: async (ux) => {
      await boot(ux.page);
      await ux.page.locator(".asof .date-trigger").click();
      await expect(ux.page.locator(".date-popover")).toBeVisible();
      await ux.capture("04-dashboard-calendar", { fullPage: false });
    },
  },
  {
    id: "05-dashboard-filter",
    desc: "Dashboard filtered to one property",
    run: async (ux) => {
      await boot(ux.page);
      // The pill variant: "All" first, then one pill per property.
      const all = ux.page.getByTestId("dashboard-filter-all");
      await expect(all).toBeVisible();
      const first = ux.page
        .getByTestId("dashboard-filter")
        .getByRole("button")
        .nth(1);
      await first.click();
      await expect(first).toHaveAttribute("aria-pressed", "true");
      await expect(all).toHaveAttribute("aria-pressed", "false");
      await ux.capture("05-dashboard-filter");
    },
  },
  {
    id: "05b-dashboard-filter-open",
    desc: "Six properties: the Dashboard filter is a dropdown, open, focus on All (ADR 0157)",
    run: async (ux) => {
      await boot(ux.page);
      await addPropertiesToSix(ux);
      await nav(ux, "dashboard");
      await openDropdown(
        ux,
        ux.page.getByTestId("dashboard-filter-trigger"),
        ux.t.common.all,
      );
      await ux.capture("05b-dashboard-filter-open", { fullPage: false });
    },
  },
  {
    id: "06-sidebar-collapsed",
    desc: "Sidebar collapsed to icon rail",
    run: async (ux) => {
      await boot(ux.page);
      await ux.page
        .getByRole("button", { name: ux.t.shell.collapseSidebar })
        .click();
      await ux.capture("06-sidebar-collapsed", { fullPage: false });
    },
  },
  {
    id: "07-dashboard-chart-table",
    desc: "Dashboard, value and LTV charts shown as tables (UX-075)",
    run: async (ux) => {
      await boot(ux.page);
      const toggles = ux.page.getByRole("button", {
        name: ux.t.charts.table,
        exact: true,
      });
      await toggles.first().click();
      await toggles.last().click();
      await expect(ux.page.locator("table.chart-table")).toHaveCount(2);
      await ux.capture("07-dashboard-chart-table");
    },
  },
  {
    id: "08-dashboard-chart-tooltip",
    desc: "Value chart focused from the keyboard: named surface, tooltip with series swatches, axe on the open tooltip (ADR 0114)",
    run: async (ux) => {
      await boot(ux.page);
      const surface = ux.page.getByRole("img", {
        name: ux.t.charts.surfaceLabel(ux.t.dashboard.chartValueVsDebtVsEquity),
      });
      // Focus opens the tooltip at the first year; the arrow keys step through years.
      await surface.focus();
      for (let i = 0; i < 5; i++) await ux.page.keyboard.press("ArrowRight");
      await expect(
        ux.page.locator(".chart-tooltip .tt-label").first(),
      ).toBeVisible();
      // Tick labels are 11 px in --ink-soft. axe does not check SVG text, and a CSS rule
      // that misses Recharts' markup fails silently (ADR 0114).
      const ticks = await ux.page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--ink-soft)";
        document.body.append(probe);
        const inkSoft = getComputedStyle(probe).color;
        probe.remove();
        const styles = [
          ...document.querySelectorAll(".recharts-cartesian-axis-tick-value"),
        ].map((el) => {
          const cs = getComputedStyle(el);
          return `${cs.fontSize} ${cs.fill === inkSoft ? "ink-soft" : cs.fill}`;
        });
        return [...new Set(styles)];
      });
      expect(ticks).toEqual(["11px ink-soft"]);
      await ux.capture("08-dashboard-chart-tooltip", { fullPage: false });
    },
  },
  {
    id: "08c-dashboard-chart-reset",
    desc: "Value chart: fixation ends marked at 2029 and 2031 (dashed line, diamond, legend entry), the 2029 tooltip lists Lipova's reset (ADR 0210)",
    run: async (ux) => {
      await boot(ux.page);
      const hero = ux.page.locator(".chart-hero");
      await expect(
        hero.locator(".recharts-reference-line.reset-marker"),
      ).toHaveCount(2);
      await expect(hero.locator(".legend")).toContainText(
        ux.t.charts.rateReset,
      );
      // The marker is drawn in --ink-soft, the axis-label colour checked for contrast in
      // both themes (screen 08), so it keeps at least 3:1 on the plot.
      const stroke = await hero.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--ink-soft)";
        document.body.append(probe);
        const inkSoft = getComputedStyle(probe).color;
        probe.remove();
        const line = el.querySelector(".reset-marker line")!;
        return getComputedStyle(line).stroke === inkSoft;
      });
      expect(stroke, "marker in --ink-soft").toBe(true);
      const surface = ux.page.getByRole("img", {
        name: ux.t.charts.surfaceLabel(ux.t.dashboard.chartValueVsDebtVsEquity),
      });
      await surface.focus();
      // Year 0 is 2026: three steps reach 2029.
      for (let i = 0; i < 3; i++) await ux.page.keyboard.press("ArrowRight");
      const tip = ux.page.locator(".chart-tooltip");
      await expect(tip.locator(".tt-reset")).toHaveCount(1);
      await expect(tip.locator(".tt-reset")).toContainText(
        "Byt Lipova · 15.01.2029",
      );
      await ux.capture("08c-dashboard-chart-reset", { fullPage: false });
    },
  },
  {
    id: "09-dashboard-data-check",
    desc: "Data check five years on, reached from the filter bar's link: the summary, then four lines with a chip per property (ADR 0118, ADR 0206)",
    run: async (ux) => {
      const d = ux.t.dataCheck;
      await boot(ux.page);
      await ux.page.getByTestId("asof-5y").click();
      // The panel is last on the page; the filter bar's link brings it into view.
      await ux.page.getByRole("button", { name: d.toReview(6) }).click();
      await expect(
        ux.page.getByRole("heading", { name: d.title, exact: true }),
      ).toBeFocused();
      const p = panel(ux, d.title);
      await expect(p.getByRole("button", { name: d.hide })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(p.locator(".dc-line")).toHaveCount(4);
      await expect(p.locator(".dc-chip")).toHaveCount(12);
      for (const chip of await p.locator(".dc-chip").all())
        await expectNotClipped(chip);
      await ux.capture("09-dashboard-data-check", { fullPage: false });
      await expectDisclosures(ux);
      // A chip opens the property and lands its section below the sticky topbar.
      await p
        .locator(
          `.dc-chip[title="${d.goTo(ux.t.propertyDetail.sectionFinancing)}"]`,
        )
        .first()
        .click();
      const heading = ux.page.getByRole("heading", {
        name: ux.t.propertyDetail.mortgagesTitle,
        exact: true,
      });
      await expect(heading).toBeFocused();
      const bar = await ux.page.locator(".topbar").boundingBox();
      const head = await heading.boundingBox();
      expect(head!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
    },
  },
  {
    id: "09b-dashboard-cash-invested",
    desc: "Dashboard KPI list with Cash invested once every property has own cash (ADR 0119 §9)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      const rows = ux.page.locator("table.data tbody tr");
      for (const [i, ownCash] of ["1500000", "1700000", "2000000"].entries()) {
        await rows
          .nth(i)
          .getByRole("button", { name: ux.t.common.edit })
          .click();
        await fillFunding(ux, { ownCash });
        await saveProperty(ux);
      }
      await nav(ux, "dashboard");
      const p = panel(ux, ux.t.dashboard.kpiTitle);
      await expect(
        p.getByText(ux.t.dashboard.kpiCashInvested, { exact: true }),
      ).toBeVisible();
      await p.scrollIntoViewIfNeeded();
      await ux.capture("09b-dashboard-cash-invested", { fullPage: false });
    },
  },
  {
    id: "10-properties",
    desc: "Properties list",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await expectRowActions(ux.page.locator("table.data"), 72);
      await expectPropertiesFit(ux);
      await ux.capture("10-properties");
    },
  },
  {
    id: "10d-properties-undrawn",
    desc: "Properties: a development loan with a tranche ahead, its short undrawn line under the debt (ADR 0205)",
    run: async (ux) => {
      await firstLoanToDevelopment(ux);
      await expect(
        panel(ux, ux.t.propertyDetail.loanSummaryTitle).getByRole(
          "progressbar",
        ),
      ).toBeVisible();
      await nav(ux, "properties");
      await expect(
        ux.page.locator("table.data tbody .cell-note").first(),
      ).toBeVisible();
      await expectPropertiesFit(ux);
      await ux.capture("10d-properties-undrawn");
    },
  },
  {
    id: "10c-properties-row-action-tooltip",
    desc: "Properties: keyboard focus on a row's Delete shows its name as a tooltip, inside the table (ADR 0199)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      const table = ux.page.locator(".table-wrap").first();
      await expectRowActionTip(
        ux.page,
        table.getByRole("button", { name: ux.t.common.delete }).first(),
        table,
      );
      await ux.capture("10c-properties-row-action-tooltip", {
        fullPage: false,
      });
      // A tooltip covering Edit never runs Delete (ADR 0199 §3): from Delete, the pointer
      // slides onto Edit; the first click hides the tooltip, the next one edits.
      const row = table.locator("tbody tr").first();
      const del = row.getByRole("button", { name: ux.t.common.delete });
      const edit = row.getByRole("button", { name: ux.t.common.edit });
      await del.hover();
      const box = (await edit.boundingBox())!;
      await ux.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await ux.page.mouse.down();
      await ux.page.mouse.up();
      await expect(ux.page.locator(".confirm-row")).toHaveCount(0);
      await ux.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(ux.page.getByRole("dialog")).toBeVisible();
      await expect(ux.page.locator(".confirm-row")).toHaveCount(0);
    },
  },
  {
    id: "10b-properties-today-projection",
    desc: "Properties at Today seven months after the projection start: rows and context line name projection year Y1 (ADR 0150)",
    run: async (ux) => {
      await ux.page.clock.setFixedTime(new Date("2027-01-15T10:00:00Z"));
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.capture("10b-properties-today-projection");
    },
  },
  {
    id: "11-property-add-modal",
    desc: "Add-property modal, empty",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.page
        .getByRole("button", { name: ux.t.properties.addProperty })
        .click();
      await expect(ux.page.getByRole("dialog")).toBeVisible();
      await ux.capture("11-property-add-modal", { fullPage: false });
    },
  },
  {
    id: "12-property-add-errors",
    desc: "Add-property modal after submitting blank",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.page
        .getByRole("button", { name: ux.t.properties.addProperty })
        .click();
      const dialog = ux.page.getByRole("dialog");
      await dialog
        .locator(".modal-foot")
        .getByRole("button", { name: ux.t.propertyForm.addTitle })
        .click();
      await expect(dialog.locator(".err").first()).toBeVisible();
      await ux.capture("12-property-add-errors", { fullPage: false });
    },
  },
  {
    id: "13-property-delete-confirm",
    desc: "Delete-property inline confirmation",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.page
        .locator("table.data tbody tr")
        .first()
        .getByRole("button", { name: ux.t.common.delete })
        .click();
      await expect(ux.page.locator(".confirm-row")).toBeVisible();
      await ux.capture("13-property-delete-confirm");
    },
  },
  {
    id: "14-properties-long-name",
    desc: "Properties list with a very long property name",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.page
        .locator("table.data tbody tr")
        .first()
        .getByRole("button", { name: ux.t.common.edit })
        .click();
      const dialog = ux.page.getByRole("dialog");
      await dialog
        .locator(".field", { hasText: ux.t.propertyForm.name })
        .locator("input")
        .first()
        .fill(
          "Byt Javorova — světlý byt s balkonem, sklepem a parkovacím stáním v klidné části města",
        );
      await dialog
        .locator(".modal-foot")
        .getByRole("button", { name: ux.t.common.saveChanges })
        .click();
      await expect(dialog).toBeHidden();
      // LTV and Net cash flow stay in view without scrolling sideways, clear of the
      // pinned actions column (ADR 0085).
      const actions = await ux.page.locator("th.actions-col").boundingBox();
      for (const col of [
        ux.t.properties.colLtv,
        ux.t.properties.colNetCashFlow,
      ]) {
        const box = await ux.page
          .getByRole("columnheader", { name: col, exact: true })
          .boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(actions!.x);
      }
      // In every language: headers wrap to at most two lines to make room (ADR 0158).
      // Measure the label's own text, not the cell or the glossary button (#282).
      const heads = await ux.page
        .locator("table.data thead th")
        .evaluateAll((ths) =>
          ths.map((th) => {
            const label = th.querySelector(".th-label, .metric-term") ?? th;
            const s = getComputedStyle(label);
            const lineHeight =
              parseFloat(s.lineHeight) || 1.2 * parseFloat(s.fontSize);
            const range = document.createRange();
            range.selectNodeContents(label);
            const lines = range.getBoundingClientRect().height / lineHeight;
            return { text: th.textContent, lines };
          }),
        );
      for (const h of heads) {
        expect(h.lines, `"${h.text}" header lines`).toBeLessThan(2.5);
      }
      await expectPropertiesFit(ux);
      await ux.capture("14-properties-long-name");
    },
  },
  {
    id: "15-property-edit-acquisition",
    desc: "Edit-property dialog with the Acquisition section open and filled (ADR 0119 §9)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.page
        .locator("table.data tbody tr")
        .first()
        .getByRole("button", { name: ux.t.common.edit })
        .click();
      const dialog = await fillFunding(ux, {
        ownCash: "1500000",
        transactionCosts: "95000",
        initialWorks: "150000",
        fundingNote: "Deposit from savings; the rest from the bank",
      });
      await dialog
        .getByLabel(ux.t.propertyForm.fundingNote, { exact: true })
        .scrollIntoViewIfNeeded();
      await ux.capture("15-property-edit-acquisition", { fullPage: false });
      await expectDisclosures(ux);
    },
  },
  {
    id: "20-property-detail",
    desc: "Property detail (first property): section nav, amortization collapsed (ADR 0107)",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      // Every section link is in view; the nav wraps rather than scrolls (ADR 0158).
      await expectNotClipped(
        ux.page
          .getByRole("navigation", {
            name: ux.t.propertyDetail.sectionNavLabel,
          })
          .getByRole("list"),
      );
      await expectPanelActionsRight(ux.page);
      await expectBandTileLabelsOneLine(ux);
      await expectPropertyTopBar(ux);
      await expectKpiStrip(ux);
      await expectRowActions(ux.page.locator("main"), 72);
      // At rest no form is open and at most one primary button shows (ADR 0207).
      const holding = panel(ux, ux.t.propertyDetail.holdingCostsTitle);
      await expect(holding.locator("form")).toHaveCount(0);
      await expect(holding.locator("dl.holding-view > div")).toHaveCount(6);
      expect(
        await ux.page.locator(".btn.primary:visible").count(),
        "primary buttons at rest",
      ).toBeLessThanOrEqual(1);
      await expectProjectionGrid(ux);
      await ux.capture("20-property-detail");
    },
  },
  {
    id: "20c-property-holding-edit",
    desc: "Property detail: Edit on Holding costs opens the form in place, focus in its first field (ADR 0207)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      await boot(ux.page);
      await openFirstProperty(ux);
      const holding = panel(ux, d.holdingCostsTitle);
      await holding.getByRole("button", { name: d.editHoldingCosts }).click();
      await expect(
        holding.getByLabel(d.fieldPropertyTax, { exact: false }),
      ).toBeFocused();
      await expect(
        holding.getByRole("button", { name: d.saveHoldingCosts }),
      ).toBeVisible();
      await holding.scrollIntoViewIfNeeded();
      await ux.capture("20c-property-holding-edit", { fullPage: false });
      await holding.getByRole("button", { name: ux.t.common.cancel }).click();
      const pencil = holding.getByRole("button", { name: d.editHoldingCosts });
      await expect(pencil).toBeFocused();
      // Focus comes back to a pencil in view, clear of the sticky top bar (ADR 0207 §3).
      const bar = await ux.page.locator(".topbar").boundingBox();
      const box = await pencil.boundingBox();
      expect(box && bar && box.y >= bar.y + bar.height).toBe(true);
      // A field cleared and saved reads as the portfolio default, marked: the sample's
      // own SVJ fee (850 Kč) gives way to the default (1 700 Kč). The sample stores all
      // six fields, so this is the only marked one.
      await pencil.click();
      await holding.getByLabel(d.fieldSvjMo, { exact: false }).fill("");
      await holding.getByRole("button", { name: d.saveHoldingCosts }).click();
      await expect(ux.page.getByText(d.holdingCostsSaved)).toBeVisible();
      await expect(pencil).toBeFocused();
      await expect(holding.getByText(d.holdingDefault)).toHaveCount(1);
      await expect(ux.page.getByText(d.holdingCostsSaved)).toBeHidden({
        timeout: 10_000,
      });
      await holding.scrollIntoViewIfNeeded();
      await ux.capture("20d-property-holding-default", { fullPage: false });
    },
  },
  {
    id: "20b-property-detail-asof-5y",
    desc: "Property detail at +5y: the as-of hint is one row under the picker, which does not move (ADR 0198)",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      await pickFiveYearsAndCheckHint(ux.page);
      await ux.capture("20b-property-detail-asof-5y", { fullPage: false });
    },
  },
  {
    id: "21d-property-info-tip",
    desc: "Property detail: the Valuations definition behind its info icon, opened from the keyboard (ADR 0217)",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const d = ux.t.propertyDetail;
      // No "About this" disclosure is left: definitions are info icons (ADR 0217 §3).
      await expect(
        ux.page.locator("button.btn", { hasText: ux.t.common.aboutThis }),
      ).toHaveCount(0);
      const button = panel(ux, d.valuationsTitle).getByRole("button", {
        name: `${ux.t.common.aboutThis}: ${d.valuationsTitle}`,
      });
      await expectInfoTip(ux.page, button);
      await expectDisclosures(ux);
      await ux.capture("21d-property-info-tip", { fullPage: false });
      await expectInfoTipEscape(ux.page, button);
    },
  },
  {
    id: "26-property-amortization-open",
    desc: "Property detail with the amortization schedule expanded: every section (ADR 0107)",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.amortizationTitle);
      const toggle = p.getByRole("button", { expanded: false });
      await toggle.click();
      await expect(p.getByRole("table")).toBeVisible();
      await ux.capture("26-property-amortization-open");
      await expectDisclosures(ux);
    },
  },
  {
    id: "27-property-section-nav-focus",
    desc: "Section nav from the keyboard: Financing's heading focused below the topbar (ADR 0107)",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const link = ux.page
        .getByRole("navigation", { name: ux.t.propertyDetail.sectionNavLabel })
        .getByRole("link", { name: ux.t.propertyDetail.sectionFinancing });
      await link.focus();
      await ux.page.keyboard.press("Enter");
      const heading = ux.page.getByRole("heading", {
        name: ux.t.propertyDetail.mortgagesTitle,
        exact: true,
      });
      await expect(heading).toBeFocused();
      await expect(link).toHaveAttribute("aria-current", "location");
      // The jump lands the heading below the sticky topbar, not under it.
      const bar = await ux.page.locator(".topbar").boundingBox();
      const head = await heading.boundingBox();
      expect(head!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
      await ux.capture("27-property-section-nav-focus", { fullPage: false });
    },
  },
  {
    id: "28-property-mortgage-events",
    desc: "Mortgage form with prepayment and maturity-change rows (ADR 0116)",
    run: async (ux) => {
      const p = await enterLoanEvents(ux);
      await p
        .getByRole("group", { name: ux.t.propertyDetail.fieldPrepayments })
        .scrollIntoViewIfNeeded();
      await ux.capture("28-property-mortgage-events");
    },
  },
  {
    id: "29-property-prepayment-outputs",
    desc: "After saving events: loan outlook, event warning, Prepaid and fee columns (ADR 0116)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      const p = await enterLoanEvents(ux);
      await p
        .locator(".form-actions")
        .getByRole("button", { name: ux.t.common.saveChanges })
        .click();
      await expect(
        panel(ux, d.loanSummaryTitle).getByText(d.interestSaved),
      ).toBeVisible();
      await expect(
        // Loan warnings are status, not alerts (ADR 0157).
        ux.page.getByRole("status").filter({ hasText: "17.01.2040" }),
      ).toBeVisible();
      const am = panel(ux, d.amortizationTitle);
      await am.getByRole("button", { expanded: false }).click();
      await expect(
        am.getByRole("columnheader", { name: d.amColPrepaid }),
      ).toBeVisible();
      await ux.capture("29-property-prepayment-outputs");
    },
  },
  {
    id: "29d-dashboard-interest-saved",
    desc: "Dashboard financing panel names the interest-saved window (ADR 0144)",
    run: async (ux) => {
      const p = await enterLoanEvents(ux);
      await p
        .locator(".form-actions")
        .getByRole("button", { name: ux.t.common.saveChanges })
        .click();
      await nav(ux, "dashboard");
      const f = panel(ux, ux.t.dashboard.financingTitle);
      await expect(
        f.getByText(ux.t.dashboard.financingInterestSaved, { exact: true }),
      ).toBeVisible();
      await f.scrollIntoViewIfNeeded();
      await ux.capture("29d-dashboard-interest-saved", { fullPage: false });
      await expectDisclosures(ux);
    },
  },
  {
    id: "29g-dashboard-financing-20-loans",
    desc: "Financing timeline with 20 loans: the first 8 rows and Show all (ADR 0204)",
    run: async (ux) => {
      await restoreEdited(ux, twentyLoans);
      const f = panel(ux, ux.t.dashboard.financingTitle);
      const more = f.getByRole("button", {
        name: ux.t.dashboard.financingShowAll(20),
      });
      await expect(more).toBeVisible();
      await expectFinancingTimeline(ux, 8);
      await more.click();
      await expectFinancingTimeline(ux);
      await f.scrollIntoViewIfNeeded();
      await ux.page.mouse.move(0, 0);
      await ux.capture("29g-dashboard-financing-20-loans", { fullPage: false });
    },
  },
  {
    id: "29h-dashboard-financing-dev-lease",
    desc: "Financing timeline: a development completion and a lease ending in the window, and the table view (ADR 0204)",
    run: async (ux) => {
      const d = ux.t.dashboard;
      await restoreEdited(ux, devLoanAndLeaseEnd);
      const f = panel(ux, d.financingTitle);
      const list = f.getByRole("list", { name: d.financingTimeline(3) });
      await expect(
        list.getByText(d.financingEventDevCompletion, { exact: false }),
      ).toBeVisible();
      await expect(
        list.getByText(d.financingEventLeaseEnd, { exact: false }),
      ).toBeVisible();
      await expectFinancingTimeline(ux, 3);
      await f.scrollIntoViewIfNeeded();
      await ux.page.mouse.move(0, 0);
      await ux.capture("29h-dashboard-financing-dev-lease", {
        fullPage: false,
      });
      await f.getByRole("button", { name: ux.t.charts.table }).click();
      await expect(
        f.getByRole("table", { name: d.financingTimeline(3) }),
      ).toBeVisible();
      await ux.capture("29i-dashboard-financing-table", { fullPage: false });
    },
  },
  {
    id: "29b-property-loan-outlook",
    desc: "Loan outlook: remaining term and each block's reset (ADR 0117)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, d.loanSummaryTitle);
      await expect(
        p.getByRole("table", { name: d.outlookResetsTitle }),
      ).toBeVisible();
      await expect(p.getByText(d.remainingTerm, { exact: true })).toBeVisible();
      await p.scrollIntoViewIfNeeded();
      await ux.capture("29b-property-loan-outlook", { fullPage: false });
    },
  },
  {
    id: "29e-property-drawdown",
    desc: "Loan outlook drawdown of a development loan: drawn of total and each draw's status (ADR 0167)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      await firstLoanToDevelopment(ux);
      const p = panel(ux, d.loanSummaryTitle);
      const drawdown = p.getByRole("region", {
        name: d.drawdownTitle,
        exact: true,
      });
      await expect(drawdown.getByRole("progressbar")).toBeVisible();
      await expect(drawdown.getByText(d.drawStatus.ahead)).toBeVisible();
      await drawdown.scrollIntoViewIfNeeded();
      await ux.page.mouse.move(0, 0);
      await ux.capture("29e-property-drawdown", { fullPage: false });
      // The drawdown note sits behind the sub-heading's info icon (ADR 0217).
      const info = drawdown.getByRole("button", {
        name: `${ux.t.common.aboutThis}: ${d.drawdownTitle}`,
      });
      await expectInfoTip(ux.page, info);
      await expectInfoTipEscape(ux.page, info);
    },
  },
  {
    id: "29f-property-dev-drawn-debt",
    desc: "Development loan with tranches ahead: drawn debt and value less the undrawn tranches in the tiles and the chart, with the dashed committed line (ADR 0169)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      await boot(ux.page);
      await openFirstProperty(ux);
      const m = panel(ux, d.mortgagesTitle);
      await m.getByRole("button", { name: ux.t.common.edit }).first().click();
      await m.getByRole("button", { name: d.loanTypeDevelopment }).click();
      await m.getByLabel(d.fieldLoanTermYears, { exact: false }).fill("30");
      const schedule = m.getByRole("group", { name: d.fieldDraws });
      const tranches: [string, string][] = [
        ["01.03.2027", "1500000"],
        ["01.03.2028", "1500000"],
      ];
      for (const [i, [date, amount]] of tranches.entries()) {
        await schedule.getByRole("button", { name: d.addTranche }).click();
        const row = schedule.getByRole("group", { name: d.trancheRow(i + 1) });
        await row.getByLabel(d.eventDate, { exact: true }).fill(date);
        await row.getByLabel(d.eventAmount).fill(amount);
      }
      await m.getByRole("button", { name: ux.t.common.saveChanges }).click();
      await expect(
        ux.page.getByText(d.seriesCommittedDebt).first(),
      ).toBeVisible();
      await ux.page.evaluate(() => window.scrollTo(0, 0));
      await ux.page.mouse.move(0, 0);
      // The undrawn note is the Debt tile's foot, on one row of tiles (ADR 0215).
      await expect(
        ux.page
          .locator(".kpi-strip .tile")
          .filter({
            has: ux.page.locator(".label", {
              hasText: new RegExp(`^${d.debt}$`),
            }),
          })
          .locator(".foot"),
      ).toContainText(ux.t.common.undrawnDebt("X").split("X")[1]!.trim());
      await expectKpiStrip(ux);
      await ux.capture("29f-property-dev-drawn-debt", { fullPage: false });
    },
  },
  {
    id: "29c-property-acquisition",
    desc: "Property detail Acquisition section: sources and uses with the gap warning (ADR 0119 §9)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      await boot(ux.page);
      await openFirstProperty(ux);
      await ux.page
        .getByRole("banner")
        .getByRole("button", { name: ux.t.properties.editProperty })
        .click();
      await fillFunding(ux, { ownCash: "1000000", transactionCosts: "95000" });
      await saveProperty(ux);
      await ux.page
        .getByRole("navigation", { name: d.sectionNavLabel })
        .getByRole("link", { name: d.sectionAcquisition })
        .click();
      const p = panel(ux, d.acqTitle);
      await expect(p.getByRole("heading", { name: d.acqTitle })).toBeFocused();
      await expect(p.getByRole("note")).toBeVisible();
      await ux.capture("29c-property-acquisition", { fullPage: false });
    },
  },
  {
    id: "29i-property-acquisition-empty",
    desc: "Property detail Acquisition with nothing but the price known: one line and Record funding, which opens the form at Acquisition (ADR 0209)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      await boot(ux.page);
      await openFirstProperty(ux);
      await ux.page
        .getByRole("navigation", { name: d.sectionNavLabel })
        .getByRole("link", { name: d.sectionAcquisition })
        .click();
      const p = panel(ux, d.acqTitle);
      await expect(p.getByRole("heading", { name: d.acqTitle })).toBeFocused();
      await expect(p.locator(".statlist")).toHaveCount(0);
      const record = p.getByRole("button", {
        name: ux.t.dataCheck.recordFunding,
      });
      await expect(record).toBeVisible();
      // The line and the button, nothing else: no table of "—", no note about "—".
      const box = await p.locator(".acq-empty").boundingBox();
      const btn = await record.boundingBox();
      // At most two lines beside or over the button, at every width and in every
      // language (a line naming the acquisition loan is longer).
      expect(box!.height, "compact").toBeLessThanOrEqual(96);
      expect(btn!.height, "24 px target").toBeGreaterThanOrEqual(24);
      await ux.capture("29i-property-acquisition-empty", { fullPage: false });
      await record.click();
      const dialog = ux.page.getByRole("dialog");
      await expect(
        dialog.getByRole("button", {
          name: ux.t.propertyForm.acquisitionSection,
        }),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        dialog.getByLabel(ux.t.propertyForm.ownCash, { exact: true }),
      ).toBeFocused();
    },
  },
  {
    id: "31-property-data-check",
    desc: "Property detail's Data check five years on, after the Overview; its link moves to Records, Record funding opens the form's Acquisition section (ADR 0118)",
    run: async (ux) => {
      const d = ux.t.dataCheck;
      await boot(ux.page);
      await ux.page.getByTestId("asof-5y").click();
      await openFirstProperty(ux);
      const p = panel(ux, d.title);
      await expect(
        p.getByRole("heading", { name: d.attentionTitle }),
      ).toBeVisible();
      // Land on it through the section nav, so the panel sits under the topbar.
      await ux.page
        .getByRole("navigation", { name: ux.t.propertyDetail.sectionNavLabel })
        .getByRole("link", { name: d.title })
        .click();
      await expect(p.getByRole("heading", { name: d.title })).toBeFocused();
      await ux.capture("31-property-data-check", { fullPage: false });
      await p
        .getByRole("button", {
          name: d.goTo(ux.t.propertyDetail.sectionRecords),
        })
        .click();
      await expect(
        ux.page.getByRole("heading", {
          name: ux.t.propertyDetail.valuationsTitle,
          exact: true,
        }),
      ).toBeFocused();
      // The own-cash link opens the property form at its Acquisition section (#178).
      await p.getByRole("button", { name: d.recordFunding }).click();
      await expect(
        ux.page
          .getByRole("dialog")
          .getByRole("button", { name: ux.t.propertyForm.acquisitionSection }),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        ux.page.getByRole("dialog").getByLabel(ux.t.propertyForm.ownCash),
      ).toBeFocused();
    },
  },
  {
    id: "21-property-valuation-edit",
    desc: "Valuation row in edit mode",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.valuationsTitle);
      await p.getByRole("button", { name: ux.t.common.edit }).first().click();
      await p.scrollIntoViewIfNeeded();
      await ux.capture("21-property-valuation-edit");
    },
  },
  {
    id: "21b-property-valuation-delete-confirm",
    desc: "Valuation delete confirm, naming the row (ADR 0143)",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.valuationsTitle);
      await p.getByRole("button", { name: ux.t.common.delete }).first().click();
      await expect(
        p.getByRole("button", { name: ux.t.common.cancel }),
      ).toBeFocused();
      await p.scrollIntoViewIfNeeded();
      await ux.capture("21b-property-valuation-delete-confirm");
    },
  },
  {
    id: "21c-property-valuation-close-previous",
    desc: "Adding an open-ended valuation asks to end the previous one (ADR 0099, 0144)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, d.valuationsTitle);
      await p.getByRole("button", { name: d.addValuation }).click();
      await p.getByLabel(d.fieldValidFrom).fill("01.01.2027");
      await p.getByLabel(new RegExp(d.fieldMarketValue)).fill("9000000");
      await p
        .getByRole("button", {
          name: d.addValuation,
        })
        .click();
      await expect(
        ux.page.getByRole("dialog", { name: d.closePrevValuationTitle }),
      ).toBeVisible();
      await ux.capture("21c-property-valuation-close-previous", {
        fullPage: false,
      });
    },
  },
  {
    id: "22-property-mortgage-add-errors",
    desc: "Add mortgage block, submitted blank",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.mortgagesTitle);
      await p
        .getByRole("button", { name: ux.t.propertyDetail.addMortgage })
        .click();
      await p
        .locator(".form-actions")
        .getByRole("button", {
          name: ux.t.propertyDetail.addMortgage,
        })
        .click();
      await expect(p.locator(".err").first()).toBeVisible();
      await ux.capture("22-property-mortgage-add-errors");
    },
  },
  {
    id: "25-property-mortgage-development",
    desc: "Add mortgage block as Development: the successor note (ADR 0098) and a drawdown schedule with a start draw, two tranches and a warning (ADR 0167)",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const d = ux.t.propertyDetail;
      const p = panel(ux, d.mortgagesTitle);
      await p.getByRole("button", { name: d.addMortgage }).click();
      await expect(p.getByText(d.successorNote)).toBeVisible();
      await p.getByRole("button", { name: d.loanTypeDevelopment }).click();
      const schedule = p.getByRole("group", { name: d.fieldDraws });
      await expect(schedule).toBeVisible();
      await p
        .getByLabel(d.fieldStartDate, { exact: false })
        .first()
        .fill("01.03.2027");
      await schedule.getByLabel(d.drawnAtStart).fill("1200000");
      await p
        .getByLabel(d.fieldCompletionDate, { exact: false })
        .fill("31.03.2028");
      const tranches: [string, string][] = [
        ["01.09.2027", "800000"],
        ["01.06.2028", "500000"],
      ];
      for (const [i, [date, amount]] of tranches.entries()) {
        await schedule.getByRole("button", { name: d.addTranche }).click();
        const row = schedule.getByRole("group", { name: d.trancheRow(i + 1) });
        await row.getByLabel(d.eventDate, { exact: true }).fill(date);
        await row.getByLabel(d.eventAmount).fill(amount);
      }
      await expect(schedule.getByText(d.warnAfterCompletion)).toBeVisible();
      // The pointer stays where the toggle was; once the form grows it can rest on a
      // chart and open its tooltip. Park it so the scan covers the form, not a hover.
      await ux.page.mouse.move(0, 0);
      await ux.capture("25-property-mortgage-development");
    },
  },
  {
    id: "24-property-record-leave-guard",
    desc: "Edited valuation form, then a sidebar click: the leave guard asks (UX-073)",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.valuationsTitle);
      await p.getByRole("button", { name: ux.t.common.edit }).first().click();
      const input = p.locator(".record-form input").first();
      await input.fill("1");
      await ux.page
        .locator(".nav")
        .getByRole("button", { name: ux.t.nav.dashboard })
        .click();
      await expect(
        ux.page.getByRole("dialog", { name: ux.t.common.unsavedTitle }),
      ).toBeVisible();
      await ux.capture("24-property-record-leave-guard", { fullPage: false });
    },
  },
  {
    id: "23-property-deactivate-confirm",
    desc: "Deactivate-property confirmation banner",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      await ux.page
        .locator(".topbar")
        .getByRole("button", { name: ux.t.propertyDetail.deactivate })
        .click();
      await expect(
        ux.page.getByRole("button", {
          name: ux.t.propertyDetail.yesDeactivate,
        }),
      ).toBeVisible();
      await ux.capture("23-property-deactivate-confirm", { fullPage: false });
    },
  },
  {
    id: "30-projections",
    desc: "Projections grid, portfolio, nominal",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "projections");
      await expectProjectionGrid(ux);
      await ux.capture("30-projections");
    },
  },
  {
    id: "30b-projections-entity-open",
    desc: "Six properties: the Projections entity picker is a dropdown, open (ADR 0157)",
    run: async (ux) => {
      await boot(ux.page);
      await addPropertiesToSix(ux);
      await nav(ux, "projections");
      await openDropdown(
        ux,
        // ADR 0197: the trigger's name is its purpose, then the value it shows.
        ux.page.getByRole("button", {
          name: `${ux.t.projections.entity} ${ux.t.projections.portfolio}`,
          exact: true,
        }),
        ux.t.projections.portfolio,
      );
      await ux.capture("30b-projections-entity-open", { fullPage: false });
    },
  },
  {
    id: "32-projections-real",
    desc: "Projections grid, real lens",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "projections");
      await pickReal(ux);
      await expectProjectionGrid(ux);
      await ux.capture("32-projections-real", { fullPage: false });
    },
  },
  {
    id: "40-scenarios",
    desc: "Scenarios, no saved scenarios",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
      await expectCompareLayout(ux);
      await ux.capture("40-scenarios");
    },
  },
  {
    id: "41-scenario-form",
    desc: "New-scenario modal",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
      await ux.page
        .getByRole("button", { name: ux.t.scenarios.addScenario })
        .click();
      await expect(ux.page.getByRole("dialog")).toBeVisible();
      await ux.capture("41-scenario-form", { fullPage: false });
    },
  },
  {
    id: "42-scenarios-compare",
    desc: "Two stress presets added and compared with Base",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
      await addTwoPresetsAndCompare(ux);
      // Re-open the page: with saved scenarios the presets start collapsed (ADR 0106).
      await nav(ux, "dashboard");
      await nav(ux, "scenarios");
      // The toast outlives a page change (ADR 0154); this screen shows the page.
      await expect(ux.page.locator(".toast")).toBeHidden({ timeout: 10_000 });
      await expect(ux.page.locator(".scenario-row")).toHaveCount(3);
      await expectScenarioGrid(ux);
      await expectPanelActionsRight(ux.page);
      await expectRowActions(ux.page.locator(".scenario-list"), 104);
      // Also around the narrow-layout breakpoint, between the captured windows.
      const window = ux.page.viewportSize()!;
      await expectCompareLayout(ux);
      for (const width of [900, 960, 1000, 1040, 1100, 1160]) {
        await ux.page.setViewportSize({ width, height: window.height });
        await expectScenarioGrid(ux);
        await expectCompareLayout(ux);
      }
      await ux.page.setViewportSize(window);
      await ux.capture("42-scenarios-compare");
      await expectDisclosures(ux);
    },
  },
  {
    id: "43-scenarios-compare-delta",
    desc: "Compare key figures as Δ vs Base (ADR 0097)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
      await addTwoPresetsAndCompare(ux);
      await nav(ux, "dashboard");
      await nav(ux, "scenarios");
      const delta = ux.page.getByRole("button", {
        name: ux.t.scenarios.viewDeltaVsBase,
      });
      await delta.click();
      await expect(delta).toHaveAttribute("aria-pressed", "true");
      // The toast outlives a page change (ADR 0154); this screen shows the page.
      await expect(ux.page.locator(".toast")).toBeHidden({ timeout: 10_000 });
      await expectCompareLayout(ux);
      await ux.capture("43-scenarios-compare-delta");
    },
  },
  {
    id: "45-scenario-delete-confirm",
    desc: "Scenario delete confirm, focus on Cancel (ADR 0143)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
      await ux.page
        .getByRole("button", { name: ux.t.scenarios.plusPp(2), exact: true })
        .click();
      await ux.page
        .locator(".scenario-row")
        .getByRole("button", { name: ux.t.common.delete })
        .first()
        .click();
      await expect(
        ux.page.getByRole("button", { name: ux.t.common.cancel }),
      ).toBeFocused();
      await ux.capture("45-scenario-delete-confirm");
    },
  },
  {
    id: "44-scenario-form-errors",
    desc: "New-scenario modal refusing a crash typed as −20 % (ADR 0123)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
      await ux.page
        .getByRole("button", { name: ux.t.scenarios.addScenario })
        .click();
      const dialog = ux.page.getByRole("dialog");
      await dialog.getByLabel(ux.t.scenarios.name).fill("Crash");
      await dialog.getByLabel(ux.t.scenarios.fieldValueCrash).fill("-20");
      await dialog
        .locator(".modal-foot")
        .getByRole("button", { name: ux.t.common.create })
        .click();
      const err = dialog.locator(".err").first();
      await expect(err).toBeVisible();
      await err.scrollIntoViewIfNeeded();
      await ux.capture("44-scenario-form-errors", { fullPage: false });
    },
  },
  {
    id: "50-import",
    desc: "Import page, nothing chosen",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "import");
      await expectImportRows(ux);
      // The drag-over state shows on the row a file is over (ADR 0212 §2), and a
      // keyboard-focused button outlines its row.
      const row = ux.page.locator(".import-row").nth(1);
      await row.dispatchEvent("dragenter", {
        dataTransfer: await ux.page.evaluateHandle(() => new DataTransfer()),
      });
      await expect(row).toHaveClass(/drag-over/);
      // A real Tab, so the focus is keyboard focus (:focus-visible).
      await ux.page
        .getByRole("button", {
          name: ux.t.importPage.templateFor(ux.t.importPage.valuationsTitle),
        })
        .focus();
      await ux.page.keyboard.press("Tab");
      await expect(
        ux.page.getByRole("button", {
          name: ux.t.importPage.chooseFileFor(ux.t.importPage.rentsTitle),
        }),
      ).toBeFocused();
      await ux.capture("50b-import-row-states", { fullPage: false });
      await row.dispatchEvent("dragleave");
      await expect(row).not.toHaveClass(/drag-over/);
      await ux.page.locator("body").focus();
      await ux.capture("50-import");
    },
  },
  {
    id: "51-import-errors",
    desc: "Import: valid properties.csv + valuations.csv with row errors",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "import");
      const inputs = ux.page.locator("input[type=file]");
      await inputs.nth(0).setInputFiles(fixture("properties-ok.csv"));
      await inputs.nth(1).setInputFiles(fixture("valuations-errors.csv"));
      await expect(ux.page.locator(".badge.bad")).toBeVisible();
      await ux.capture("51-import-errors");
    },
  },
  {
    id: "52-import-done",
    desc: "Import report after a successful import",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "import");
      await ux.page
        .locator("input[type=file]")
        .first()
        .setInputFiles(fixture("properties-ok.csv"));
      // ADR 0096: one new property, so the button states the scope.
      await ux.page
        .getByRole("button", { name: ux.t.importPage.importScope(1, 1, 0) })
        .click();
      await expect(
        ux.page.getByRole("heading", { name: ux.t.importPage.reportTitle }),
      ).toBeVisible();
      await ux.capture("52-import-done");
    },
  },
  {
    id: "53-import-preview",
    desc: "Import preview: one add, one update, overwrite confirmation open",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "import");
      await ux.page
        .locator("input[type=file]")
        .first()
        .setInputFiles(fixture("properties-update.csv"));
      await expectImportRows(ux, true);
      await ux.page
        .getByRole("button", { name: ux.t.importPage.importScope(2, 1, 1) })
        .click();
      await expect(
        ux.page.getByRole("button", {
          name: ux.t.importPage.confirmOverwrite(1),
        }),
      ).toBeVisible();
      await ux.capture("53-import-preview");
      await expectDisclosures(ux);
    },
  },
  {
    id: "54-import-preview-failed",
    desc: "Import: the preview read failed, so an error says why Import is unavailable (ADR 0147)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "import");
      // The browser database does not fail on its own: fail the preview the way a broken
      // read would. Vite serves the store module by URL, so this is the app's own instance.
      await ux.page.evaluate(async () => {
        const store = "/src/state/portfolioStore.ts";
        const { usePortfolioStore } = (await import(
          /* @vite-ignore */ store
        )) as typeof import("../src/state/portfolioStore");
        usePortfolioStore.setState({
          previewCsv: () => Promise.reject(new Error("disk I/O error")),
        });
      });
      await ux.page
        .locator("input[type=file]")
        .first()
        .setInputFiles(fixture("properties-ok.csv"));
      await expect(ux.page.getByText(/disk I\/O error/)).toBeVisible();
      await ux.capture("54-import-preview-failed");
    },
  },
  {
    id: "55-import-loan-events",
    desc: "Import preview: a new block lists the saved events it stops and asks first; an earlier start has no effect (ADR 0160)",
    run: async (ux) => {
      const p = await enterLoanEvents(ux);
      await p
        .locator(".form-actions")
        .getByRole("button", { name: ux.t.common.saveChanges })
        .click();
      await expect(
        panel(ux, ux.t.propertyDetail.loanSummaryTitle).getByText(
          ux.t.propertyDetail.interestSaved,
        ),
      ).toBeVisible();
      await nav(ux, "import");
      await ux.page
        .locator("input[type=file]")
        .nth(3)
        .setInputFiles(fixture("mortgages-successor.csv"));
      await expect(
        ux.page.getByText(ux.t.importPage.noEffectNote),
      ).toBeVisible();
      await ux.page
        .getByRole("button", { name: ux.t.importPage.importScope(2, 2, 0) })
        .click();
      await expect(
        ux.page.getByRole("button", { name: ux.t.importPage.confirmReplace }),
      ).toBeVisible();
      await ux.capture("55-import-loan-events");
    },
  },
  {
    id: "56-import-stored-event",
    desc: "Import refused: a shorter term breaks a saved prepayment, named with its date (ADR 0160)",
    run: async (ux) => {
      // One prepayment only: a maturity change would move the loan's end with it.
      await boot(ux.page);
      await openFirstProperty(ux);
      const d = ux.t.propertyDetail;
      const p = panel(ux, d.mortgagesTitle);
      await p.getByRole("button", { name: ux.t.common.edit }).first().click();
      await p.getByRole("button", { name: d.eventAddPrepayment }).click();
      const row = p.getByRole("group", { name: d.eventPrepaymentRow(1) });
      await row.getByLabel(d.eventDate, { exact: true }).fill("17.01.2031");
      await row.getByLabel(d.eventAmount).fill("500000");
      await p
        .locator(".form-actions")
        .getByRole("button", { name: ux.t.common.saveChanges })
        .click();
      await expect(
        panel(ux, d.loanSummaryTitle).getByText(d.interestSaved),
      ).toBeVisible();
      await nav(ux, "import");
      await ux.page
        .locator("input[type=file]")
        .nth(3)
        .setInputFiles(fixture("mortgages-shorter-term.csv"));
      await expect(
        ux.page.locator("td.cell-message", { hasText: "17.01.2031" }),
      ).toBeVisible();
      await ux.capture("56-import-stored-event");
    },
  },
  {
    id: "60-settings-assumptions",
    desc: "Settings → Assumptions",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "assumptions");
      await ux.capture("60-settings-assumptions");
    },
  },
  {
    id: "61-settings-assumptions-error",
    desc: "Assumptions with an invalid value after Save",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "assumptions");
      await ux.page
        .locator(".field", { hasText: ux.t.assumptions.inflation })
        .locator("input")
        .fill("abc");
      await ux.page
        .getByRole("button", { name: ux.t.common.saveChanges })
        .click();
      await expect(ux.page.locator(".field.invalid")).toBeVisible();
      await ux.capture("61-settings-assumptions-error");
    },
  },
  {
    id: "62-settings-assumptions-bounds",
    desc: "Assumptions with an out-of-range horizon and a negative cost after Save (ADR 0075)",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "assumptions");
      // By the label's start: "Horizon" is also a word of the selling-cost field's
      // label and help (ADR 0183), so a text match would find two fields.
      const field = (label: string) =>
        ux.page.getByLabel(
          new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`),
        );
      await field(ux.t.assumptions.horizon).fill("101");
      await field(ux.t.assumptions.other).fill("-500");
      await ux.page
        .getByRole("button", { name: ux.t.common.saveChanges })
        .click();
      await expect(ux.page.locator(".field.invalid")).toHaveCount(2);
      await ux.capture("62-settings-assumptions-bounds");
    },
  },
  {
    id: "63-settings-assumptions-unsaved",
    desc: "Assumptions with an unsaved edit: the sticky Save row in the window (ADR 0095)",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "assumptions");
      await ux.page
        .locator(".field", { hasText: ux.t.assumptions.inflation })
        .locator("input")
        .fill("3");
      await expect(ux.page.getByText(ux.t.common.unsavedChanges)).toBeVisible();
      await ux.capture("63-settings-assumptions-unsaved", { fullPage: false });
    },
  },
  {
    id: "64-settings-backup",
    desc: "Settings → Backup / Restore",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "backup");
      await ux.capture("64-settings-backup");
    },
  },
  {
    id: "64b-settings-backup-refused",
    desc: "Settings → Backup: a refused backup in the notice, with its records (ADR 0154)",
    run: async (ux) => {
      await chooseEditedBackup(ux, (tables) => {
        const [lease] = tables.leases ?? [];
        if (!lease) throw new Error("the sample has no lease");
        lease.monthly_rent = "abc";
      });
      await expect(ux.page.getByText(ux.t.backup.errRowsInvalid)).toBeVisible();
      await expect(ux.page.getByText(ux.t.backup.downloaded)).toBeHidden();
      await ux.capture("64b-settings-backup-refused", { fullPage: false });
    },
  },
  {
    id: "64c-settings-backup-toast",
    desc: "Settings → Backup: the export's toast in the shell's live region (ADR 0154)",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "backup");
      await ux.page
        .getByRole("button", { name: ux.t.backup.exportButton })
        .click();
      await expect(ux.page.locator(".toast")).toBeVisible();
      await ux.capture("64c-settings-backup-toast", { fullPage: false });
    },
  },
  {
    id: "65-about",
    desc: "About modal (opened from the native menu in the app; here via the UI store)",
    run: async (ux) => {
      await boot(ux.page);
      // The browser has no native menu: open it the way the menu://about bridge does.
      // Vite serves the store module by URL, so this is the app's own instance.
      await ux.page.evaluate(async () => {
        const store = "/src/state/uiStore.ts";
        const { useUiStore } = (await import(
          /* @vite-ignore */ store
        )) as typeof import("../src/state/uiStore");
        useUiStore.getState().openAbout();
      });
      await expect(ux.page.getByRole("dialog")).toBeVisible();
      await ux.capture("65-about", { fullPage: false });
    },
  },
  {
    id: "66-sidebar-backup-hint",
    desc: "Sidebar backup reminder after an edit with no backup yet (ADR 0110)",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "assumptions");
      await ux.page
        .locator(".field", { hasText: ux.t.assumptions.inflation })
        .locator("input")
        .fill("3");
      await ux.page
        .getByRole("button", { name: ux.t.common.saveChanges })
        .click();
      await expect(
        ux.page.getByRole("button", { name: ux.t.shell.backupHintNone }),
      ).toBeVisible();
      await ux.capture("66-sidebar-backup-hint", { fullPage: false });
    },
  },
  {
    id: "67-restore-out-of-range",
    desc: "Restore confirm step: values outside the form ranges listed, Restore anyway (ADR 0148)",
    run: async (ux) => {
      await pickOutOfRangeBackup(ux);
      await expect(
        ux.page.getByRole("region", { name: ux.t.backup.warningsTitle }),
      ).toBeVisible();
      await ux.capture("67-restore-out-of-range");
    },
  },
  {
    id: "68-data-check-out-of-range",
    desc: "Dashboard Data check after Restore anyway: the horizon row and the mortgage's fixation (ADR 0148)",
    run: async (ux) => {
      await pickOutOfRangeBackup(ux);
      await ux.page
        .getByRole("button", { name: ux.t.backup.restoreAnyway })
        .click();
      await expect(
        ux.page.getByRole("button", { name: ux.t.backup.chooseFile }),
      ).toBeVisible();
      await nav(ux, "dashboard");
      const p = panel(ux, ux.t.dataCheck.title);
      await expect(
        p.getByRole("button", {
          name: ux.t.dataCheck.goTo(ux.t.settings.tabs.assumptions),
        }),
      ).toBeVisible();
      await p.scrollIntoViewIfNeeded();
      await ux.capture("68-data-check-out-of-range", { fullPage: false });
    },
  },
  {
    id: "69-restore-early-date",
    desc: "Restore confirm step: a stored date before 1900 listed, Restore anyway (ADR 0149)",
    run: async (ux) => {
      await pickEarlyDateBackup(ux);
      await expect(
        ux.page.getByRole("region", { name: ux.t.backup.warningsTitle }),
      ).toBeVisible();
      await ux.capture("69-restore-early-date");
    },
  },
  {
    id: "69b-data-check-early-date",
    desc: "Dashboard Data check after Restore anyway: the property's purchase date before 1900 (ADR 0149)",
    run: async (ux) => {
      await pickEarlyDateBackup(ux);
      await ux.page
        .getByRole("button", { name: ux.t.backup.restoreAnyway })
        .click();
      await expect(
        ux.page.getByRole("button", { name: ux.t.backup.chooseFile }),
      ).toBeVisible();
      await nav(ux, "dashboard");
      const p = panel(ux, ux.t.dataCheck.title);
      await expect(
        p.getByText(/01\.01\.1850/, { exact: false }).first(),
      ).toBeVisible();
      await p.scrollIntoViewIfNeeded();
      await ux.capture("69b-data-check-early-date", { fullPage: false });
    },
  },
  {
    id: "70-guide",
    desc: "Guide (full page)",
    run: async (ux) => {
      await boot(ux.page);
      // Opening the Guide from a page scrolled down lands at its top (ADR 0213 §3).
      await nav(ux, "projections");
      await ux.page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      expect(await ux.page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await nav(ux, "guide");
      await expect.poll(() => ux.page.evaluate(() => window.scrollY)).toBe(0);
      await ux.capture("70-guide");
    },
  },
  {
    id: "70b-guide-section-nav",
    desc: "Guide: a section link lands its section under the top bar, marked current (ADR 0213)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "guide");
      const navEl = ux.page.getByRole("navigation", {
        name: ux.t.guide.sectionNavLabel,
      });
      await expect(navEl.getByRole("link")).toHaveCount(10);
      const link = navEl.getByRole("link", { name: ux.t.guide.glossaryTitle });
      await link.click();
      await expect(link).toHaveAttribute("aria-current", "location");
      const heading = ux.page.getByRole("heading", {
        name: ux.t.guide.glossaryTitle,
        level: 2,
      });
      await expect(heading).toBeFocused();
      // The heading sits just under the sticky top bar, not behind it.
      const bar = (await ux.page.locator(".topbar").boundingBox())!;
      const h = (await heading.boundingBox())!;
      expect(h.y, "heading below the top bar").toBeGreaterThanOrEqual(
        bar.y + bar.height,
      );
      expect(h.y, "heading near the top").toBeLessThan(
        bar.y + bar.height + 120,
      );
      // The nav wraps; the page never scrolls sideways (ADR 0158).
      expect(
        await ux.page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await ux.capture("70b-guide-section-nav", { fullPage: false });
      // A metric label still opens the Guide at its term (UX-044), shown below the
      // taller top bar.
      await nav(ux, "projections");
      await ux.page
        .locator(".metric-term", { hasText: /^NOI$/ })
        .first()
        .click();
      const term = ux.page.locator("#glossary-noi");
      await expect(term).toBeFocused();
      const bar2 = (await ux.page.locator(".topbar").boundingBox())!;
      const tb = (await term.boundingBox())!;
      expect(tb.y, "term below the top bar").toBeGreaterThanOrEqual(
        bar2.y + bar2.height,
      );
      expect(tb.y + tb.height, "term in the window").toBeLessThanOrEqual(
        ux.page.viewportSize()!.height,
      );
    },
  },
  {
    id: "80-empty-portfolio",
    desc: "Dashboard after deleting every property",
    run: async (ux) => {
      await boot(ux.page);
      await deleteAllProperties(ux);
      await ux.capture("80-empty-properties");
      await nav(ux, "dashboard");
      await ux.capture("80-empty-portfolio");
    },
  },
  {
    id: "81-clear-sample-dialog",
    desc: "Clear sample confirmation, opened from the sample banner (ADR 0094)",
    run: async (ux) => {
      // Opened only: the browser build has no app backups folder for the safety backup.
      await boot(ux.page);
      await ux.page
        .getByRole("button", { name: ux.t.sample.clearAction })
        .click();
      await expect(ux.page.getByRole("dialog")).toBeVisible();
      await ux.capture("81-clear-sample-dialog");
    },
  },
  {
    id: "82-load-sample",
    desc: "Load sample portfolio on an empty portfolio, then its banner (ADR 0112)",
    run: async (ux) => {
      await boot(ux.page);
      await deleteAllProperties(ux);
      await settingsTab(ux, "backup");
      const load = ux.page.getByRole("button", {
        name: ux.t.sample.loadAction,
      });
      await expect(load).toBeVisible();
      await ux.capture("82-load-sample");
      await load.click();
      await expect(ux.page.getByText(ux.t.sample.loaded)).toBeVisible();
      await ux.capture("82-load-sample-loaded");
      await nav(ux, "dashboard");
      await expect(ux.page.getByText(ux.t.sample.banner)).toBeVisible();
      // The toast outlives a page change (ADR 0154); this screen shows the page.
      await expect(ux.page.locator(".toast")).toBeHidden({ timeout: 10_000 });
      await ux.capture("82-load-sample-banner");
    },
  },
  {
    id: "83-all-deactivated",
    desc: "An inactive property's page, then every property deactivated (ADR 0155)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      const count = await ux.page.locator("table.data tbody tr").count();
      for (let i = 0; i < count; i++) {
        await nav(ux, "properties");
        await ux.page.locator("table.data tbody tr td.left").nth(i).click();
        const topbar = ux.page.locator(".topbar");
        await topbar
          .getByRole("button", { name: ux.t.propertyDetail.deactivate })
          .click();
        await ux.page
          .getByRole("button", { name: ux.t.propertyDetail.yesDeactivate })
          .click();
        await expect(
          topbar.getByRole("button", { name: ux.t.propertyDetail.activate }),
        ).toBeVisible();
        if (i === 0) await ux.capture("83-property-inactive");
      }
      const notice = ux.page.getByText(ux.t.common.allInactiveTitle(count));
      await nav(ux, "dashboard");
      await expect(notice).toBeVisible();
      await ux.capture("83-all-deactivated-dashboard");
      await nav(ux, "projections");
      await expect(notice).toBeVisible();
      await ux.capture("83-all-deactivated-projections");
      await nav(ux, "scenarios");
      await expect(notice).toBeVisible();
      await ux.capture("83-all-deactivated-scenarios");
    },
  },
  {
    id: "84-pending-property",
    desc: "A future purchase: its Properties row and its page (ADR 0156)",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.page
        .getByRole("button", { name: ux.t.properties.addProperty })
        .click();
      const dialog = ux.page.getByRole("dialog");
      const f = ux.t.propertyForm;
      await dialog.getByLabel(f.name, { exact: true }).fill("Byt Lesní");
      await dialog
        .getByLabel(f.purchaseDate, { exact: true })
        .fill("15.03.2028");
      await dialog.getByLabel(f.purchasePrice, { exact: true }).fill("6000000");
      await dialog
        .locator(".modal-foot")
        .getByRole("button", { name: f.addTitle })
        .click();
      await expect(dialog).toBeHidden();
      const row = ux.page.locator("table.data tbody tr", {
        hasText: "Byt Lesní",
      });
      await expect(
        row.getByText(ux.t.properties.pendingPurchaseOn("15.03.2028")),
      ).toBeVisible();
      await expectPropertiesFit(ux);
      await ux.capture("84-properties-pending");
      await row.getByRole("button", { name: "Byt Lesní" }).click();
      // The panel's heading: the Properties cells carry the same words (ADR 0189).
      await expect(
        ux.page.getByRole("heading", {
          name: ux.t.propertyDetail.notOwnedTitle,
        }),
      ).toBeVisible();
      await ux.capture("84-property-pending");
    },
  },
  {
    id: "90-keyboard-focus",
    desc: "Keyboard-only: Tab order from page load, with focus screenshots",
    run: async (ux) => {
      await boot(ux.page);
      const order: string[] = [];
      for (let i = 1; i <= 40; i++) {
        await ux.page.keyboard.press("Tab");
        order.push(
          await ux.page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return "(body)";
            // The accessible name, roughly: aria-label, then aria-labelledby, then the
            // text. An SVG has no innerText, so an unnamed chart records "" (ADR 0114).
            const labelledBy = el
              .getAttribute("aria-labelledby")
              ?.split(" ")
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ");
            const name = (
              el.getAttribute("aria-label") ??
              labelledBy ??
              el.innerText ??
              ""
            )
              .trim()
              .slice(0, 60);
            const role = el.getAttribute("role");
            // getAttribute, not className: an SVG's className is an SVGAnimatedString.
            const cls = el.getAttribute("class")?.split(" ")[0];
            return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${role ? `[role=${role}]` : ""} "${name}"`;
          }),
        );
        if ([1, 8, 12, 20].includes(i))
          await ux.shot(`90-keyboard-focus-tab${i}`, { fullPage: false });
      }
      ux.writeJson("90-keyboard-focus-order.json", order);
      // ADR 0114: the first stop is the skip link, and every chart surface has a name.
      expect(order[0]).toBe(`button.skip-link "${ux.t.shell.skipToContent}"`);
      // Every chart surface on the page, not only those within the Tab walk.
      const surfaces = await ux.page
        .locator("svg.recharts-surface")
        .evaluateAll((els) =>
          els.map((el) => [
            el.getAttribute("role"),
            el.getAttribute("aria-label") ?? "",
          ]),
        );
      expect(surfaces.length).toBeGreaterThan(0);
      expect(
        surfaces.filter(([role, name]) => role !== "img" || name === ""),
      ).toEqual([]);
      // Enter on the skip link moves focus into the page content.
      await boot(ux.page);
      await ux.page.keyboard.press("Tab");
      await ux.page.keyboard.press("Enter");
      const skipTarget = await ux.page.evaluate(
        () => document.activeElement?.id,
      );
      expect(skipTarget).toBe("main");
      ux.writeJson("90-keyboard-skip-link.json", { skipTarget });
      // Properties list: can a row (the drill-in target) be reached by keyboard? A
      // button outside the actions column counts (UX-022 makes the name a button).
      await nav(ux, "properties");
      const rowFocusable = await ux.page
        .locator("table.data tbody tr")
        .first()
        .evaluate(
          (tr) =>
            (tr as HTMLElement).tabIndex >= 0 ||
            !!tr.querySelector("a,[role=link],td:not(.actions-col) button"),
        );
      ux.writeJson("90-keyboard-property-row.json", { rowFocusable });
      expect(rowFocusable).toBe(true);
    },
  },
  {
    id: "91-nav-focus",
    desc: "Keyboard: Enter on Properties in the sidebar moves focus to the new page's main region",
    run: async (ux) => {
      await boot(ux.page);
      await ux.page
        .locator(".nav")
        .getByRole("button", { name: ux.t.nav.properties })
        .focus();
      await ux.page.keyboard.press("Enter");
      await expect(ux.page.locator(".page-title")).toHaveText(
        ux.t.properties.title,
      );
      // ADR 0146: focus lands on <main>, not <body>, and Tab continues in the page.
      const afterNav = await ux.page.evaluate(() => document.activeElement?.id);
      expect(afterNav).toBe("main");
      await ux.page.keyboard.press("Tab");
      const afterTab = await ux.page.evaluate(() => {
        const el = document.activeElement;
        return {
          inMain: !!el?.closest("main"),
          tag: el?.tagName.toLowerCase() ?? "",
        };
      });
      expect(afterTab.inMain).toBe(true);
      ux.writeJson("91-nav-focus.json", { afterNav, afterTab });
      await ux.capture("91-nav-focus", { fullPage: false });
    },
  },
];

/** Every route must have at least one capture; a new Route fails typecheck here. */
export const ROUTE_COVERAGE = {
  dashboard: "01-dashboard",
  properties: "10-properties",
  property: "20-property-detail",
  projections: "30-projections",
  scenarios: "40-scenarios",
  import: "50-import",
  settings: "60-settings-assumptions",
  guide: "70-guide",
} satisfies Record<Route, string>;
