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
      invoke: (cmd: string, args: { json?: string }) =>
        cmd === "open_backup_file"
          ? Promise.resolve({ name: "portfolio-backup-legacy.json", text })
          : cmd === "write_app_backup"
            ? Promise.resolve(args.json)
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
      invoke: (cmd: string, args: { json?: string }) =>
        cmd === "open_backup_file"
          ? Promise.resolve({ name: "portfolio-backup.json", text: json })
          : cmd === "write_app_backup"
            ? Promise.resolve(args.json)
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
      await ux.capture("01-dashboard");
    },
  },
  {
    id: "02-dashboard-real",
    desc: "Dashboard, real lens",
    run: async (ux) => {
      await boot(ux.page);
      await pickReal(ux);
      await ux.capture("02-dashboard-real");
    },
  },
  {
    id: "03-dashboard-asof-5y",
    desc: "Dashboard, as-of +5y preset",
    run: async (ux) => {
      await boot(ux.page);
      const preset = ux.page.getByTestId("asof-5y");
      await preset.click();
      await expect(preset).toHaveAttribute("aria-pressed", "true");
      await ux.capture("03-dashboard-asof-5y");
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
    id: "09-dashboard-data-check",
    desc: "Data check five years on: open with stale valuations and ended fixations, then the defaults (ADR 0118)",
    run: async (ux) => {
      const d = ux.t.dataCheck;
      await boot(ux.page);
      await ux.page.getByTestId("asof-5y").click();
      const p = panel(ux, d.title);
      await expect(p.getByRole("button", { name: d.hide })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(
        p.getByRole("heading", { name: d.defaultsTitle }),
      ).toBeVisible();
      await p.scrollIntoViewIfNeeded();
      await ux.capture("09-dashboard-data-check", { fullPage: false });
      // A fix link opens the property and lands its section below the sticky topbar.
      await p
        .getByRole("button", {
          name: d.goTo(ux.t.propertyDetail.sectionFinancing),
        })
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
      await ux.capture("10-properties");
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
      const heads = await ux.page
        .locator("table.data thead th")
        .evaluateAll((ths) =>
          ths.map((th) => {
            const s = getComputedStyle(th);
            const lineHeight =
              parseFloat(s.lineHeight) || 1.2 * parseFloat(s.fontSize);
            const range = document.createRange();
            range.selectNodeContents(th);
            const lines = range.getBoundingClientRect().height / lineHeight;
            return { text: th.textContent, lines };
          }),
        );
      for (const h of heads) {
        expect(h.lines, `"${h.text}" header lines`).toBeLessThan(2.5);
      }
      // A band badge wraps at most once: the figure, then the whole word (ADR 0158).
      const badges = await ux.page
        .locator("table.data tbody td:not(.sticky-col) .badge")
        .evaluateAll((els) =>
          els.map((el) => {
            const s = getComputedStyle(el);
            const lineHeight =
              parseFloat(s.lineHeight) || 1.2 * parseFloat(s.fontSize);
            const content =
              el.clientHeight -
              parseFloat(s.paddingTop) -
              parseFloat(s.paddingBottom);
            return { text: el.textContent, lines: content / lineHeight };
          }),
        );
      expect(badges.length).toBeGreaterThan(0);
      for (const b of badges) {
        expect(b.lines, `"${b.text}" badge lines`).toBeLessThan(2.5);
      }
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
      await ux.capture("20-property-detail");
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
          name: `${ux.t.common.addVerb} ${d.addValuation}`,
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
          name: `${ux.t.common.addVerb} ${ux.t.propertyDetail.addMortgage}`,
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
      await schedule
        .getByRole("group", { name: d.drawnAtStart })
        .getByLabel(d.eventAmount)
        .fill("1200000");
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
        ux.page.getByRole("button", { name: ux.t.projections.entity }),
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
      await ux.capture("32-projections-real", { fullPage: false });
    },
  },
  {
    id: "40-scenarios",
    desc: "Scenarios, no saved scenarios",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
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
        .getByRole("button", { name: ux.t.scenarios.newScenario })
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
      // Also around the narrow-layout breakpoint, between the captured windows.
      const window = ux.page.viewportSize()!;
      for (const width of [960, 1000, 1040, 1100, 1160]) {
        await ux.page.setViewportSize({ width, height: window.height });
        await expectScenarioGrid(ux);
      }
      await ux.page.setViewportSize(window);
      await ux.capture("42-scenarios-compare");
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
        .getByRole("button", { name: ux.t.scenarios.newScenario })
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
      await ux.page
        .getByRole("button", { name: ux.t.importPage.importScope(2, 1, 1) })
        .click();
      await expect(
        ux.page.getByRole("button", {
          name: ux.t.importPage.confirmOverwrite(1),
        }),
      ).toBeVisible();
      await ux.capture("53-import-preview");
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
      const field = (label: string) =>
        ux.page.locator(".field", { hasText: label }).locator("input");
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
          name: ux.t.dataCheck.goTo(ux.t.dataCheck.assumptions),
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
      await nav(ux, "guide");
      await ux.capture("70-guide");
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
      await ux.capture("84-properties-pending");
      await row.getByRole("button", { name: "Byt Lesní" }).click();
      await expect(
        ux.page.getByText(ux.t.propertyDetail.notOwnedTitle),
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
