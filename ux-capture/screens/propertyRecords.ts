// Property records: Data check, valuations, mortgages, the leave guard and deactivation.
import {
  boot,
  clickInPlace,
  expect,
  openFirstProperty,
  panel,
} from "../helpers";
import { expectDataCheckLayout } from "../layout/pages";
import { defineScreen, type Screen } from "./define";

export const propertyRecordsScreens: Screen[] = [
  defineScreen(
    "31-property-data-check",
    "Property detail's Data check five years on, the last section, reached by the title pill; its link moves to Records, Record funding opens the form's Acquisition section (ADR 0118, ADR 0223)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
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
  ),
  defineScreen(
    "21-property-valuation-edit",
    "Valuation row in edit mode",
    async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.valuationsTitle);
      await p.getByRole("button", { name: ux.t.common.edit }).first().click();
      await p.scrollIntoViewIfNeeded();
      await ux.capture();
    },
  ),
  defineScreen(
    "21b-property-valuation-delete-confirm",
    "Valuation delete confirm, naming the row (ADR 0143)",
    async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.valuationsTitle);
      await p.getByRole("button", { name: ux.t.common.delete }).first().click();
      await expect(
        p.getByRole("button", { name: ux.t.common.cancel }),
      ).toBeFocused();
      await p.scrollIntoViewIfNeeded();
      await ux.capture();
    },
  ),
  defineScreen(
    "21c-property-valuation-close-previous",
    "Adding an open-ended valuation ends the previous one the day before (ADR 0227)",
    async (ux) => {
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
      await ux.capture({
        fullPage: false,
      });
    },
  ),
  defineScreen(
    "22-property-mortgage-add-errors",
    "Add mortgage block, submitted blank",
    async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.mortgagesTitle);
      await p
        .getByRole("button", { name: ux.t.propertyDetail.addMortgage })
        .click();
      // The submit sits below the fold: a scrolling click would flake the shot (#536).
      await clickInPlace(
        p.locator(".form-actions").getByRole("button", {
          name: ux.t.propertyDetail.addMortgage,
        }),
      );
      await expect(p.locator(".err").first()).toBeVisible();
      await ux.capture();
    },
  ),
  defineScreen(
    "25-property-mortgage-development",
    "Add mortgage block as Development: the successor note (ADR 0098) and a drawdown schedule with a start draw, two tranches and a warning (ADR 0167)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "24-property-record-leave-guard",
    "Edited valuation form, then a sidebar click: the leave guard asks (UX-073)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "23-property-deactivate-confirm",
    "Deactivate-property confirmation banner",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
];
