// Property detail: sections, holding costs, info tips, amortization and loan events.
import { breakFirstLoan, enterLoanEvents } from "../flows";
import {
  boot,
  expect,
  openFirstProperty,
  panel,
  pickFiveYearsAndCheckHint,
} from "../helpers";
import {
  expectDisclosures,
  expectInfoTip,
  expectInfoTipEscape,
  expectNotClipped,
  expectPanelActionsRight,
  expectRowActions,
} from "../layout/common";
import {
  expectBandTileLabelsOneLine,
  expectKpiStrip,
} from "../layout/dashboard";
import {
  expectInvalidPropertyData,
  expectProjectionGrid,
  expectPropertyTopBar,
} from "../layout/pages";
import { defineScreen, type Screen } from "./define";

export const propertyDetailScreens: Screen[] = [
  defineScreen(
    "20-property-detail",
    "Property detail (first property): section nav, amortization collapsed (ADR 0107)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "20c-property-holding-edit",
    "Property detail: Edit on Holding costs opens the form in place, focus in its first field (ADR 0207)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
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
  ),
  defineScreen(
    "20e-property-invalid-data",
    "Property detail with a stored loan that breaks a rule: the invalid-data notice, the records to fix and no figures (DR-146)",
    async (ux) => {
      const name = await breakFirstLoan(ux);
      await expectInvalidPropertyData(ux, name);
      await ux.capture();
    },
  ),
  defineScreen(
    "20b-property-detail-asof-5y",
    "Property detail at +5y: the as-of hint is one row under the picker, which does not move (ADR 0198)",
    async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      await pickFiveYearsAndCheckHint(ux.page);
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "21d-property-info-tip",
    "Property detail: the Valuations definition behind its info icon, opened from the keyboard (ADR 0217)",
    async (ux) => {
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
      // The info popover is the point of the shot: keep the pointer (#536).
      await ux.capture({ fullPage: false, keepPointer: true });
      await expectInfoTipEscape(ux.page, button);
    },
  ),
  defineScreen(
    "26-property-amortization-open",
    "Property detail with the amortization schedule expanded: every section (ADR 0107)",
    async (ux) => {
      await boot(ux.page);
      await openFirstProperty(ux);
      const p = panel(ux, ux.t.propertyDetail.amortizationTitle);
      const toggle = p.getByRole("button", { expanded: false });
      await toggle.click();
      await expect(p.getByRole("table")).toBeVisible();
      await ux.capture();
      await expectDisclosures(ux);
    },
  ),
  defineScreen(
    "27-property-section-nav-focus",
    "Section nav from the keyboard: Financing's heading focused below the topbar (ADR 0107)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "28-property-mortgage-events",
    "Mortgage form with prepayment and maturity-change rows (ADR 0116)",
    async (ux) => {
      const p = await enterLoanEvents(ux);
      await p
        .getByRole("group", { name: ux.t.propertyDetail.fieldPrepayments })
        .scrollIntoViewIfNeeded();
      await ux.capture();
    },
  ),
];
