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
  deleteAllProperties,
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

/** Saves the open property dialog and waits for it to close. */
async function saveProperty(ux: Ux) {
  const dialog = ux.page.getByRole("dialog");
  await dialog
    .locator(".modal-foot")
    .getByRole("button", { name: ux.t.common.saveChanges })
    .click();
  await expect(dialog).toBeHidden();
}

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
    id: "08-dashboard-chart-tooltip",
    desc: "Value chart focused from the keyboard: named surface, tooltip with series swatches, axe on the open tooltip (ADR 0114)",
    route: "dashboard",
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
    route: "dashboard",
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
    route: "dashboard",
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
    id: "15-property-edit-acquisition",
    desc: "Edit-property dialog with the Acquisition section open and filled (ADR 0119 §9)",
    route: "properties",
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
    route: "property",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      await ux.capture("20-property-detail");
    },
  },
  {
    id: "26-property-amortization-open",
    desc: "Property detail with the amortization schedule expanded: every section (ADR 0107)",
    route: "property",
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
    route: "property",
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
    route: "property",
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
    route: "property",
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
        ux.page.getByRole("alert").filter({ hasText: "17.01.2040" }),
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
    id: "29b-property-loan-outlook",
    desc: "Loan outlook: remaining term and each block's reset (ADR 0117)",
    route: "property",
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
    route: "property",
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
    route: "property",
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
    id: "25-property-mortgage-development",
    desc: "Add mortgage block as Development, with the successor note (ADR 0098)",
    route: "property",
    run: async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.mortgagesTitle);
      await p
        .getByRole("button", { name: ux.t.propertyDetail.addMortgage })
        .click();
      await expect(
        p.getByText(ux.t.propertyDetail.successorNote),
      ).toBeVisible();
      await p
        .getByRole("button", { name: ux.t.propertyDetail.loanTypeDevelopment })
        .click();
      await expect(
        p.getByLabel(ux.t.propertyDetail.fieldDraws, { exact: false }),
      ).toBeVisible();
      // The pointer stays where the toggle was; once the form grows it can rest on a
      // chart and open its tooltip. Park it so the scan covers the form, not a hover.
      await ux.page.mouse.move(0, 0);
      await ux.capture("25-property-mortgage-development");
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
      // Re-open the page: with saved scenarios the presets start collapsed (ADR 0106).
      await nav(ux, "dashboard");
      await nav(ux, "scenarios");
      await ux.capture("42-scenarios-compare");
    },
  },
  {
    id: "43-scenarios-compare-delta",
    desc: "Compare key figures as Δ vs Base (ADR 0097)",
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
      await nav(ux, "dashboard");
      await nav(ux, "scenarios");
      await ux.page
        .getByRole("button", { name: ux.t.scenarios.viewDeltaVsBase })
        .click();
      await ux.capture("43-scenarios-compare-delta");
    },
  },
  {
    id: "44-scenario-form-errors",
    desc: "New-scenario modal refusing a crash typed as −20 % (ADR 0123)",
    route: "scenarios",
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
    id: "63-settings-assumptions-unsaved",
    desc: "Assumptions with an unsaved edit: the sticky Save row in the window (ADR 0095)",
    route: "settings",
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
    id: "66-sidebar-backup-hint",
    desc: "Sidebar backup reminder after an edit with no backup yet (ADR 0110)",
    route: "settings",
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
      await deleteAllProperties(ux);
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
    id: "82-load-sample",
    desc: "Load sample portfolio on an empty portfolio, then its banner (ADR 0112)",
    route: "settings",
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
      await ux.capture("82-load-sample-banner");
    },
  },
  {
    id: "90-keyboard-focus",
    desc: "Keyboard-only: Tab order from page load, with focus screenshots",
    route: "dashboard",
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
