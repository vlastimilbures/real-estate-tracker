// Settings: Assumptions, Backup, About, the backup reminder and out-of-range restores.
import { chooseEditedBackup, pickOutOfRangeBackup } from "../flows";
import { boot, expect, nav, panel, settingsTab } from "../helpers";
import { expectNavGroups } from "../layout/common";
import { expectSettingsTopBar } from "../layout/pages";
import { defineScreen, type Screen } from "./define";

export const settingsScreens: Screen[] = [
  defineScreen(
    "60-settings-assumptions",
    "Settings → Assumptions",
    async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "assumptions");
      await expectSettingsTopBar(ux, "assumptions");
      await ux.capture();
    },
  ),
  defineScreen(
    "61-settings-assumptions-error",
    "Assumptions with an invalid value after Save",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "62-settings-assumptions-bounds",
    "Assumptions with an out-of-range horizon and a negative cost after Save (ADR 0075)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "63-settings-assumptions-unsaved",
    "Assumptions with an unsaved edit: Save and the state text in the top bar (ADR 0095, 0221)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "64-settings-backup",
    "Settings → Backup / Restore",
    async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "backup");
      await expectSettingsTopBar(ux, "backup");
      await ux.capture();
    },
  ),
  defineScreen(
    "64b-settings-backup-refused",
    "Settings → Backup: a refused backup in the notice, with its records (ADR 0154)",
    async (ux) => {
      await chooseEditedBackup(
        ux,
        (tables) => {
          const [lease] = tables.leases ?? [];
          if (!lease) throw new Error("the sample has no lease");
          lease.monthly_rent = "abc";
        },
        // The shot follows the click directly: no scroll before it (#536).
        { inPlace: true },
      );
      await expect(ux.page.getByText(ux.t.backup.errRowsInvalid)).toBeVisible();
      await expect(ux.page.getByText(ux.t.backup.downloaded)).toBeHidden();
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "64c-settings-backup-toast",
    "Settings → Backup: the export's toast in the shell's live region (ADR 0154)",
    async (ux) => {
      await boot(ux.page);
      await settingsTab(ux, "backup");
      await ux.page
        .getByRole("button", { name: ux.t.backup.exportButton })
        .click();
      await expect(ux.page.locator(".toast")).toBeVisible();
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "65-about",
    "About modal (opened from the native menu in the app; here via the UI store)",
    async (ux) => {
      await boot(ux.page);
      // The browser has no native menu: open it the way the menu://about bridge does.
      // Vite serves the store module by URL, so this is the app's own instance.
      await ux.page.evaluate(async () => {
        const store = "/src/state/uiStore.ts";
        const { useUiStore } = (await import(
          /* @vite-ignore */ store
        )) as typeof import("../../src/state/uiStore");
        useUiStore.getState().openAbout();
      });
      await expect(ux.page.getByRole("dialog")).toBeVisible();
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "66-sidebar-backup-hint",
    "Sidebar backup reminder after an edit with no backup yet (ADR 0110)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
      // The tallest footer: the groups still neither overlap nor get cut off (ADR 0219).
      await expectNavGroups(ux);
    },
  ),
  defineScreen(
    "67-restore-out-of-range",
    "Restore confirm step: values outside the form ranges listed, Restore anyway (ADR 0148)",
    async (ux) => {
      await pickOutOfRangeBackup(ux);
      await expect(
        ux.page.getByRole("region", { name: ux.t.backup.warningsTitle }),
      ).toBeVisible();
      await ux.capture();
    },
  ),
  defineScreen(
    "68-data-check-out-of-range",
    "Dashboard Data check after Restore anyway: the horizon row and the mortgage's fixation (ADR 0148)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
];
