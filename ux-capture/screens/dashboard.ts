// Dashboard: lenses, as-of dates, filter, charts, KPI band and Data check.
import {
  addPropertiesToSix,
  fillFunding,
  openDropdown,
  pickReal,
  saveProperty,
} from "../flows";
import {
  boot,
  expect,
  nav,
  panel,
  pickFiveYearsAndCheckHint,
} from "../helpers";
import {
  expectDisclosures,
  expectNavGroups,
  expectNotClipped,
  expectPanelActionsRight,
} from "../layout/common";
import {
  expectBandTileLabelsOneLine,
  expectDashboardHierarchy,
  expectFinancingTimeline,
  expectKeyFigures,
  expectKpiStrip,
} from "../layout/dashboard";
import { expectDataCheckLayout } from "../layout/pages";
import { defineScreen, type Screen } from "./define";

export const dashboardScreens: Screen[] = [
  defineScreen(
    "01-dashboard",
    "Dashboard, nominal, as of today",
    async (ux) => {
      await boot(ux.page);
      // The reset-window toggle shows every option, inside its panel head (ADR 0158).
      const head = panel(ux, ux.t.dashboard.financingTitle).locator(
        ".panel-head",
      );
      await expectNotClipped(head.locator(".segmented"));
      await expectNotClipped(head);
      await expectPanelActionsRight(ux.page);
      await expectBandTileLabelsOneLine(ux);
      await ux.capture();
      // After the shot, so a failing layout still leaves its picture.
      await expectKpiStrip(ux);
      await expectDashboardHierarchy(ux);
      await expectNavGroups(ux);
      await expectFinancingTimeline(ux, 3, 300);
      await expectKeyFigures(ux);
    },
  ),
  defineScreen("02-dashboard-real", "Dashboard, real lens", async (ux) => {
    await boot(ux.page);
    await pickReal(ux);
    await ux.capture();
    // After the shot, so a failing layout still leaves its picture.
    await expectKpiStrip(ux);
    await expectKeyFigures(ux);
  }),
  defineScreen(
    "03-dashboard-asof-5y",
    "Dashboard, as-of +5y preset",
    async (ux) => {
      await boot(ux.page);
      await pickFiveYearsAndCheckHint(ux.page);
      await ux.capture();
      // After the shot, so a failing layout still leaves its picture.
      await expectKpiStrip(ux);
    },
  ),
  defineScreen(
    "03b-dashboard-real-asof-5y",
    "Dashboard, real lens at +5y: the net worth foot names base-date Kč (ADR 0200 §4)",
    async (ux) => {
      await boot(ux.page);
      await pickReal(ux);
      await pickFiveYearsAndCheckHint(ux.page);
      await ux.capture();
      // The base-date note may take the net worth foot to a third line.
      await expectKpiStrip(ux, 112);
    },
  ),
  defineScreen(
    "04-dashboard-calendar",
    "As-of calendar popover open",
    async (ux) => {
      await boot(ux.page);
      await ux.page.locator(".asof .date-trigger").click();
      await expect(ux.page.locator(".date-popover")).toBeVisible();
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "05-dashboard-filter",
    "Dashboard filtered to one property",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "05b-dashboard-filter-open",
    "Six properties: the Dashboard filter is a dropdown, open, focus on All (ADR 0157)",
    async (ux) => {
      await boot(ux.page);
      await addPropertiesToSix(ux);
      await nav(ux, "dashboard");
      await openDropdown(
        ux,
        ux.page.getByTestId("dashboard-filter-trigger"),
        ux.t.common.all,
      );
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "06-sidebar-collapsed",
    "Sidebar collapsed to icon rail",
    async (ux) => {
      await boot(ux.page);
      await ux.page
        .getByRole("button", { name: ux.t.shell.collapseSidebar })
        .click();
      await ux.capture({ fullPage: false });
      // A wider grid with the bar collapsed: two per row from 640 px (ADR 0218 §2).
      await expectDashboardHierarchy(ux);
      await expectNavGroups(ux);
    },
  ),
  defineScreen(
    "07-dashboard-chart-table",
    "Dashboard, value and LTV charts shown as tables (UX-075)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "08-dashboard-chart-tooltip",
    "Value chart focused from the keyboard: named surface, tooltip with series swatches, axe on the open tooltip (ADR 0114)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "08c-dashboard-chart-reset",
    "Value chart: fixation ends marked at 2029 and 2031 (dashed line, diamond, legend entry), the 2029 tooltip lists Lipova's reset (ADR 0210)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "09-dashboard-data-check",
    "Data check five years on, reached from the filter bar's link: the summary, then four lines with a chip per property (ADR 0118, ADR 0206)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
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
  ),
  defineScreen(
    "09b-dashboard-cash-invested",
    "Dashboard KPI list with Cash invested once every property has own cash (ADR 0119 §9)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
];
