// Screen manifest for the UX capture run. One entry = one user-visible state; `run`
// drives the app there through the UI and calls `ux.capture(id)` (PNG + axe scan).
// To add a screen: append an entry here (ids are zero-padded so files sort in flow order).
import path from "node:path";
import type { Route } from "../src/state/uiStore";
import {
  expect,
  nav,
  openFirstProperty,
  panel,
  settingsTab,
  boot,
  type Ux,
} from "./helpers";

export interface Screen {
  id: string;
  /** What the capture shows (goes into summary.md). */
  desc: string;
  route: Route;
  run: (ux: Ux) => Promise<void>;
}

// Resolved from the repo root (the cwd of `pnpm ux:capture`).
const fixture = (name: string) => path.resolve("ux-capture", "fixtures", name);

export const SCREENS: Screen[] = [
  {
    id: "00-loading",
    desc: "Startup loading screen (sql.js init delayed)",
    route: "dashboard",
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
    id: "01-dashboard",
    desc: "Dashboard, nominal, as of today",
    route: "dashboard",
    run: async (ux) => {
      await boot(ux.page);
      await ux.capture("01-dashboard");
    },
  },
  {
    id: "02-dashboard-real",
    desc: "Dashboard, real lens",
    route: "dashboard",
    run: async (ux) => {
      await boot(ux.page);
      await ux.page
        .getByRole("button", { name: ux.t.common.real, exact: true })
        .click();
      await ux.capture("02-dashboard-real");
    },
  },
  {
    id: "03-dashboard-asof-5y",
    desc: "Dashboard, as-of +5y preset",
    route: "dashboard",
    run: async (ux) => {
      await boot(ux.page);
      await ux.page.getByTestId("asof-5y").click();
      await ux.capture("03-dashboard-asof-5y");
    },
  },
  {
    id: "04-dashboard-calendar",
    desc: "As-of calendar popover open",
    route: "dashboard",
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
    route: "dashboard",
    run: async (ux) => {
      await boot(ux.page);
      await ux.page
        .getByTestId("dashboard-filter")
        .getByRole("button")
        .nth(1)
        .click();
      await ux.capture("05-dashboard-filter");
    },
  },
  {
    id: "06-sidebar-collapsed",
    desc: "Sidebar collapsed to icon rail",
    route: "dashboard",
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
    route: "dashboard",
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
    id: "10-properties",
    desc: "Properties list",
    route: "properties",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.capture("10-properties");
    },
  },
  {
    id: "11-property-add-modal",
    desc: "Add-property modal, empty",
    route: "properties",
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
    route: "properties",
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
    route: "properties",
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
    route: "properties",
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
      await ux.capture("14-properties-long-name");
    },
  },
  {
    id: "20-property-detail",
    desc: "Property detail (first property)",
    route: "property",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      await ux.capture("20-property-detail");
    },
  },
  {
    id: "21-property-valuation-edit",
    desc: "Valuation row in edit mode",
    route: "property",
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
    id: "22-property-mortgage-add-errors",
    desc: "Add mortgage block, submitted blank",
    route: "property",
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
    id: "24-property-record-leave-guard",
    desc: "Edited valuation form, then a sidebar click: the leave guard asks (UX-073)",
    route: "property",
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
    route: "property",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      await ux.page
        .locator(".topbar")
        .getByRole("button", { name: ux.t.propertyDetail.deactivate })
        .click();
      await ux.capture("23-property-deactivate-confirm", { fullPage: false });
    },
  },
  {
    id: "30-projections",
    desc: "Projections grid, portfolio, nominal",
    route: "projections",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "projections");
      await ux.capture("30-projections");
    },
  },
  {
    id: "31-projections-real",
    desc: "Projections grid, real lens",
    route: "projections",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "projections");
      await ux.page
        .getByRole("button", { name: ux.t.common.real, exact: true })
        .click();
      await ux.capture("31-projections-real", { fullPage: false });
    },
  },
  {
    id: "40-scenarios",
    desc: "Scenarios, no saved scenarios",
    route: "scenarios",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
      await ux.capture("40-scenarios");
    },
  },
  {
    id: "41-scenario-form",
    desc: "New-scenario modal",
    route: "scenarios",
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
    route: "scenarios",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "scenarios");
      await ux.page
        .getByRole("button", { name: ux.t.scenarios.plusPp(2), exact: true })
        .click();
      await ux.page.getByRole("button", { name: "−20%", exact: true }).click();
      const picks = ux.page.locator(".scenario-row input[type=checkbox]");
      await expect(picks).toHaveCount(3);
      await picks.nth(1).check();
      await picks.nth(2).check();
      await ux.capture("42-scenarios-compare");
    },
  },
  {
    id: "50-import",
    desc: "Import page, nothing chosen",
    route: "import",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "import");
      await ux.capture("50-import");
    },
  },
  {
    id: "51-import-errors",
    desc: "Import: valid properties.csv + valuations.csv with row errors",
    route: "import",
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
    route: "import",
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
    route: "import",
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
    id: "60-settings-assumptions",
    desc: "Settings → Assumptions",
    route: "settings",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "assumptions");
      await ux.capture("60-settings-assumptions");
    },
  },
  {
    id: "61-settings-assumptions-error",
    desc: "Assumptions with an invalid value after Save",
    route: "settings",
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
    route: "settings",
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
    id: "64-settings-backup",
    desc: "Settings → Backup / Restore",
    route: "settings",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "backup");
      await ux.capture("64-settings-backup");
    },
  },
  {
    id: "65-about",
    desc: "About modal (opened from the native menu in the app; here via the UI store)",
    route: "dashboard",
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
    id: "70-guide",
    desc: "Guide (full page)",
    route: "guide",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "guide");
      await ux.capture("70-guide");
    },
  },
  {
    id: "80-empty-portfolio",
    desc: "Dashboard after deleting every property",
    route: "dashboard",
    run: async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      const rows = ux.page.locator("table.data tbody tr");
      while ((await rows.count()) > 0) {
        await rows
          .first()
          .getByRole("button", { name: ux.t.common.delete })
          .click();
        await ux.page
          .locator(".confirm-row")
          .getByRole("button", { name: ux.t.common.yesDelete })
          .click();
        await expect(ux.page.locator(".confirm-row")).toHaveCount(0);
      }
      await ux.capture("80-empty-properties");
      await nav(ux, "dashboard");
      await ux.capture("80-empty-portfolio");
    },
  },
  {
    id: "81-clear-sample-dialog",
    desc: "Clear sample confirmation, opened from the sample banner (ADR 0094)",
    route: "dashboard",
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
    id: "90-keyboard-focus",
    desc: "Keyboard-only: Tab order from page load, with focus screenshots",
    route: "dashboard",
    run: async (ux) => {
      await boot(ux.page);
      const order: string[] = [];
      for (let i = 1; i <= 30; i++) {
        await ux.page.keyboard.press("Tab");
        order.push(
          await ux.page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return "(body)";
            const name =
              el.getAttribute("aria-label") ??
              el.innerText?.trim().slice(0, 40) ??
              "";
            // getAttribute, not className: an SVG's className is an SVGAnimatedString.
            const cls = el.getAttribute("class")?.split(" ")[0];
            return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${name}"`;
          }),
        );
        if ([1, 8, 12, 20].includes(i))
          await ux.shot(`90-keyboard-focus-tab${i}`, { fullPage: false });
      }
      ux.writeJson("90-keyboard-focus-order.json", order);
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
