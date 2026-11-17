// Properties list and the add, edit and delete property dialogs.
import { fillFunding, firstLoanToDevelopment } from "../flows";
import { boot, expect, nav, panel } from "../helpers";
import {
  expectDisclosures,
  expectRowActions,
  expectRowActionTip,
} from "../layout/common";
import { expectPropertiesFit } from "../layout/pages";
import { defineScreen, type Screen } from "./define";

export const propertiesScreens: Screen[] = [
  defineScreen("10-properties", "Properties list", async (ux) => {
    await boot(ux.page);
    await nav(ux, "properties");
    await expectRowActions(ux.page.locator("table.data"), 72);
    await expectPropertiesFit(ux);
    await ux.capture();
  }),
  defineScreen(
    "10d-properties-undrawn",
    "Properties: a development loan with a tranche ahead, its short undrawn line under the debt (ADR 0205)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "10c-properties-row-action-tooltip",
    "Properties: keyboard focus on a row's Delete shows its name as a tooltip, inside the table (ADR 0199)",
    async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      const table = ux.page.locator(".table-wrap").first();
      await expectRowActionTip(
        ux.page,
        table.getByRole("button", { name: ux.t.common.delete }).first(),
        table,
      );
      await ux.capture({
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
  ),
  defineScreen(
    "10b-properties-today-projection",
    "Properties at Today seven months after the projection start: rows and context line name projection year Y1 (ADR 0150)",
    async (ux) => {
      await ux.page.clock.setFixedTime(new Date("2027-01-15T10:00:00Z"));
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.capture();
    },
  ),
  defineScreen(
    "11-property-add-modal",
    "Add-property modal, empty",
    async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.page
        .getByRole("button", { name: ux.t.properties.addProperty })
        .click();
      await expect(ux.page.getByRole("dialog")).toBeVisible();
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "12-property-add-errors",
    "Add-property modal after submitting blank",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "13-property-delete-confirm",
    "Delete-property inline confirmation",
    async (ux) => {
      await boot(ux.page);
      await nav(ux, "properties");
      await ux.page
        .locator("table.data tbody tr")
        .first()
        .getByRole("button", { name: ux.t.common.delete })
        .click();
      await expect(ux.page.locator(".confirm-row")).toBeVisible();
      await ux.capture();
    },
  ),
  defineScreen(
    "14-properties-long-name",
    "Properties list with a very long property name",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "15-property-edit-acquisition",
    "Edit-property dialog with the Acquisition section open and filled (ADR 0119 §9)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
      await expectDisclosures(ux);
    },
  ),
];
