// Import: file rows, errors, preview and loan events.
import { enterLoanEvents, fixture } from "../flows";
import { boot, expect, nav, openFirstProperty, panel } from "../helpers";
import { expectDisclosures } from "../layout/common";
import { expectImportRows } from "../layout/pages";
import { defineScreen, type Screen } from "./define";

export const importScreens: Screen[] = [
  defineScreen("50-import", "Import page, nothing chosen", async (ux) => {
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
    await ux.capture();
  }),
  defineScreen(
    "51-import-errors",
    "Import: valid properties.csv + valuations.csv with row errors",
    async (ux) => {
      await boot(ux.page);
      await nav(ux, "import");
      const inputs = ux.page.locator("input[type=file]");
      await inputs.nth(0).setInputFiles(fixture("properties-ok.csv"));
      await inputs.nth(1).setInputFiles(fixture("valuations-errors.csv"));
      await expect(ux.page.locator(".badge.bad")).toBeVisible();
      await ux.capture();
    },
  ),
  defineScreen(
    "52-import-done",
    "Import report after a successful import",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "53-import-preview",
    "Import preview: one add, one update, overwrite confirmation open",
    async (ux) => {
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
      await ux.capture();
      await expectDisclosures(ux);
    },
  ),
  defineScreen(
    "54-import-preview-failed",
    "Import: the preview read failed, so an error says why Import is unavailable (ADR 0147)",
    async (ux) => {
      await boot(ux.page);
      await nav(ux, "import");
      // The browser database does not fail on its own: fail the preview the way a broken
      // read would. Vite serves the store module by URL, so this is the app's own instance.
      await ux.page.evaluate(async () => {
        const store = "/src/state/portfolioStore.ts";
        const { usePortfolioStore } = (await import(
          /* @vite-ignore */ store
        )) as typeof import("../../src/state/portfolioStore");
        usePortfolioStore.setState({
          previewCsv: () =>
            Promise.resolve({
              ok: false,
              error: { kind: "other", message: "disk I/O error" },
            }),
        });
      });
      await ux.page
        .locator("input[type=file]")
        .first()
        .setInputFiles(fixture("properties-ok.csv"));
      await expect(ux.page.getByText(/disk I\/O error/)).toBeVisible();
      await ux.capture();
    },
  ),
  defineScreen(
    "55-import-loan-events",
    "Import preview: a new block lists the saved events it stops and asks first; an earlier start has no effect (ADR 0160)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "56-import-stored-event",
    "Import refused: a shorter term breaks a saved prepayment, named with its date (ADR 0160)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
];
