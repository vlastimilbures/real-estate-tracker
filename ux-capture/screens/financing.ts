// Financing: prepayment outputs, the Dashboard's financing panel, loan outlook,
// development loans and the acquisition funding.
import {
  devLoanAndLeaseEnd,
  enterLoanEvents,
  fillFunding,
  firstLoanToDevelopment,
  restoreEdited,
  saveProperty,
  twentyLoans,
} from "../flows";
import { boot, expect, nav, openFirstProperty, panel } from "../helpers";
import {
  expectDisclosures,
  expectInfoTip,
  expectInfoTipEscape,
  expectNotClipped,
} from "../layout/common";
import { expectFinancingTimeline, expectKpiStrip } from "../layout/dashboard";
import { defineScreen, type Screen } from "./define";

export const financingScreens: Screen[] = [
  defineScreen(
    "29-property-prepayment-outputs",
    "After saving events: loan outlook, event warning, Prepaid and fee columns (ADR 0116)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "29d-dashboard-interest-saved",
    "Dashboard financing panel names the interest-saved window (ADR 0144)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
      await expectDisclosures(ux);
    },
  ),
  defineScreen(
    "29g-dashboard-financing-20-loans",
    "Financing timeline with 20 loans: the first 8 rows and Show all (ADR 0204)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "29h-dashboard-financing-dev-lease",
    "Financing timeline: a development completion and a lease ending in the window, and the table view (ADR 0204)",
    async (ux) => {
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
      await ux.capture({
        fullPage: false,
      });
      await f.getByRole("button", { name: ux.t.charts.table }).click();
      await expect(
        f.getByRole("table", { name: d.financingTimeline(3) }),
      ).toBeVisible();
      await ux.capture("29i-dashboard-financing-table", { fullPage: false });
    },
  ),
  defineScreen(
    "29b-property-loan-outlook",
    "Loan outlook right after the charts: the figure row, then each block's reset; the note behind the info icon (ADR 0117, ADR 0224)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
      // The note is behind the info icon (§5).
      const info = p.getByRole("button", {
        name: `${ux.t.common.aboutThis}: ${d.loanSummaryTitle}`,
      });
      await expectInfoTip(ux.page, info);
      await expect(p.locator(".panel-note")).toHaveCount(0);
    },
  ),
  defineScreen(
    "29e-property-drawdown",
    "Loan outlook drawdown of a development loan: drawn of total and each draw's status (ADR 0167)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
      // The drawdown note sits behind the sub-heading's info icon (ADR 0217).
      const info = drawdown.getByRole("button", {
        name: `${ux.t.common.aboutThis}: ${d.drawdownTitle}`,
      });
      await expectInfoTip(ux.page, info);
      await expectInfoTipEscape(ux.page, info);
    },
  ),
  defineScreen(
    "29f-property-dev-drawn-debt",
    "Development loan with tranches ahead: drawn debt and value less the undrawn tranches in the tiles and the chart, with the dashed committed line (ADR 0169)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "29c-property-acquisition",
    "Property detail Acquisition section: sources and uses with the gap warning (ADR 0119 §9)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "29i-property-acquisition-empty",
    "Property detail Acquisition with nothing but the price known: one line and Record funding, which opens the form at Acquisition (ADR 0209)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
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
  ),
];
