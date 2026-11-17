// Screen manifest for the UX capture run. One entry = one user-visible state; `run`
// drives the app there through the UI and calls `ux.capture(id)` (PNG + axe scan).
// To add a screen: add an entry here with a free id. The id's leading number groups
// screens by area (0x dashboard, 1x properties, 2x property detail, …); the order of
// this list is the flow order and need not match the file order.
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
  pickFiveYearsAndCheckHint,
  type Ux,
} from "./helpers";
import {
  addPropertiesToSix,
  bootFailing,
  bootRestoreConfirm,
  chooseEditedBackup,
  devLoanAndLeaseEnd,
  enterLoanEvents,
  fillFunding,
  firstLoanToDevelopment,
  fixture,
  openDropdown,
  pickOutOfRangeBackup,
  pickReal,
  restoreEdited,
  saveProperty,
  twentyLoans,
} from "./flows";
import {
  expectDisclosures,
  expectInfoTip,
  expectInfoTipEscape,
  expectNavGroups,
  expectNotClipped,
  expectPanelActionsRight,
  expectRowActions,
  expectRowActionTip,
} from "./layout/common";
import {
  expectBandTileLabelsOneLine,
  expectDashboardHierarchy,
  expectFinancingTimeline,
  expectKeyFigures,
  expectKpiStrip,
} from "./layout/dashboard";
import {
  expectCompareLayout,
  expectDataCheckLayout,
  expectImportRows,
  expectProjectionGrid,
  expectPropertiesFit,
  expectPropertyTopBar,
  expectScenarioGrid,
  expectScenariosPanel,
  expectSettingsTopBar,
} from "./layout/pages";

export interface Screen {
  id: string;
  /** What the capture shows (the test title in the capture run). */
  desc: string;
  run: (ux: Ux) => Promise<void>;
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
      await expectNavGroups(ux);
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
      // A wider grid with the bar collapsed: two per row from 640 px (ADR 0218 §2).
      await expectDashboardHierarchy(ux);
      await expectNavGroups(ux);
    },
  },
  {
    id: "07-dashboard-chart-table",
    desc: "Dashboard, value and LTV charts shown as tables (UX-075)",
    run: async (ux) => {
      await boot(ux.page);
      const toggles = ux.page
        .locator(".projection-charts")
        .getByRole("button", {
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
      const hero = ux.page.locator(".projection-charts .chart-card").first();
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
      // The panel is last on the page; the title's pill brings it into view.
      // The count sits beside the page title (ADR 0218 §1).
      const pill = ux.page.locator(".topbar").getByRole("button", {
        name: d.reviewPill(6),
      });
      await expect(pill).toHaveText("6");
      await expectNotClipped(ux.page.locator(".topbar .page-title-row"));
      await pill.click();
      await expect(
        ux.page.getByRole("heading", { name: d.title, exact: true }),
      ).toBeFocused();
      const p = panel(ux, d.title);
      await expect(p.getByRole("button", { name: d.hide })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(p.locator(".dc-row")).toHaveCount(4);
      await expectDataCheckLayout(p);
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
    desc: "Loan outlook right after the charts: the figure row, then each block's reset; the note behind the info icon (ADR 0117, ADR 0224)",
    run: async (ux) => {
      const d = ux.t.propertyDetail;
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, d.loanSummaryTitle);
      await expect(
        p.getByRole("table", { name: d.outlookResetsTitle }),
      ).toBeVisible();
      // In the Overview, right after the charts (ADR 0224 §1).
      const placed = await p.evaluate((el) => {
        const section = el.closest(".pd-section");
        const prev = el.previousElementSibling;
        return {
          section: section?.id,
          afterCharts:
            !!prev?.querySelector(".chart-grid") ||
            !!prev?.matches(".chart-grid"),
        };
      });
      expect(placed).toEqual({ section: "pd-overview", afterCharts: true });
      // The figure row: next reset, debt at reset, payoff, remaining term (§2);
      // every figure in full, none overflowing the row.
      const figures = p.locator(".fx-figure");
      await expect(figures.locator("dt")).toHaveText([
        d.outlookStatus.nextReset,
        d.colBalanceAtReset,
        d.loanPayoff,
        d.remainingTerm,
      ]);
      for (const f of await figures.all()) await expectNotClipped(f);
      await p.scrollIntoViewIfNeeded();
      await ux.capture("29b-property-loan-outlook", { fullPage: false });
      // The note is behind the info icon (§5).
      const info = p.getByRole("button", {
        name: `${ux.t.common.aboutThis}: ${d.loanSummaryTitle}`,
      });
      await expectInfoTip(ux.page, info);
      await expect(p.locator(".panel-note")).toHaveCount(0);
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
          .locator(".kpi-band .tile")
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
    desc: "Property detail's Data check five years on, the last section, reached by the title pill; its link moves to Records, Record funding opens the form's Acquisition section (ADR 0118, ADR 0223)",
    run: async (ux) => {
      const d = ux.t.dataCheck;
      await boot(ux.page);
      await ux.page.getByTestId("asof-5y").click();
      await openFirstProperty(ux);
      const p = panel(ux, d.title);
      await expect(
        p.getByRole("heading", { name: d.attentionTitle }),
      ).toBeVisible();
      // The last section (ADR 0223 §5): the section nav's last link.
      await expect(
        ux.page
          .getByRole("navigation", {
            name: ux.t.propertyDetail.sectionNavLabel,
          })
          .getByRole("link")
          .last(),
      ).toHaveText(d.title);
      // Land on it through the title pill, so the panel sits under the topbar.
      await ux.page.locator(".topbar .title-pill").click();
      await expect(p.getByRole("heading", { name: d.title })).toBeFocused();
      await expectDataCheckLayout(p);
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
    desc: "Adding an open-ended valuation ends the previous one the day before (ADR 0227)",
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
      // No dialog: the form closes and the earlier row ends the day before.
      await expect(p.getByLabel(d.fieldValidFrom)).toHaveCount(0);
      await expect(p.getByRole("cell", { name: "31.12.2026" })).toBeVisible();
      await p.scrollIntoViewIfNeeded();
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
      // Nothing saved: the presets are open (ADR 0106, 0220).
      await expectScenariosPanel(ux, true, 0);
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
      await expectScenariosPanel(ux, false, 2);
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
      await expectSettingsTopBar(ux, "assumptions");
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
      // The failed state text fits the top bar (ADR 0221 §2).
      await expectSettingsTopBar(ux, "assumptions");
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
      // The failed state text fits the top bar (ADR 0221 §2).
      await expectSettingsTopBar(ux, "assumptions");
      await ux.capture("62-settings-assumptions-bounds");
    },
  },
  {
    id: "63-settings-assumptions-unsaved",
    desc: "Assumptions with an unsaved edit: Save and the state text in the top bar (ADR 0095, 0221)",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "assumptions");
      await ux.page
        .locator(".field", { hasText: ux.t.assumptions.inflation })
        .locator("input")
        .fill("3");
      await expect(
        ux.page.locator("header.topbar").getByText(ux.t.common.unsavedChanges),
      ).toBeVisible();
      await expectSettingsTopBar(ux, "assumptions");
      await ux.capture("63-settings-assumptions-unsaved", { fullPage: false });
    },
  },
  {
    id: "64-settings-backup",
    desc: "Settings → Backup / Restore",
    run: async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "backup");
      await expectSettingsTopBar(ux, "backup");
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
      // The tallest footer: the groups still neither overlap nor get cut off (ADR 0219).
      await expectNavGroups(ux);
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
      // Narrow, the links take one row; wide, they wrap to at most two (ADR 0225 §2).
      const rows = await navEl.evaluate(
        (n) =>
          new Set(
            Array.from(n.querySelectorAll("a"), (a) =>
              Math.round(a.getBoundingClientRect().top),
            ),
          ).size,
      );
      const narrow = (ux.page.viewportSize()?.width ?? 1280) < 1100;
      if (narrow) expect(rows, "one row when narrow").toBe(1);
      else expect(rows, "two rows at most").toBeLessThanOrEqual(2);
      /** A link sits in the row, clear of a fade on either side (32 px). */
      const clear = (sel: string) =>
        navEl.evaluate((n, s) => {
          const list = n.querySelector("ul")!.getBoundingClientRect();
          const a = n.querySelector(s)!.getBoundingClientRect();
          const fadeStart = (n as HTMLElement).dataset.moreStart === "true";
          const fadeEnd = (n as HTMLElement).dataset.moreEnd === "true";
          return (
            a.left >= list.left + (fadeStart ? 32 : 0) - 1 &&
            a.right <= list.right - (fadeEnd ? 32 : 0) + 1
          );
        }, sel);
      // The page never scrolls sideways (ADR 0158).
      expect(
        await ux.page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await ux.capture("70b-guide-section-nav", { fullPage: false });
      if (narrow) {
        // The current link follows the page, not a click: back to the row's start,
        // then the page to its end, where the last section becomes current.
        await navEl.evaluate((n) => (n.querySelector("ul")!.scrollLeft = 0));
        await ux.page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        const last = navEl.getByRole("link").last();
        await expect(last).toHaveAttribute("aria-current", "location");
        expect(
          await clear('a[aria-current="location"]'),
          "current in view",
        ).toBe(true);
        // A link reached by Tab clears the fade too.
        await navEl.getByRole("link").first().focus();
        for (let i = 0; i < 4; i++) await ux.page.keyboard.press("Tab");
        expect(await clear("a:focus"), "a tabbed-to link in view").toBe(true);
      }
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
