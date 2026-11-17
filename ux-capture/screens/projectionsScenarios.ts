// Projections and Scenarios: the year grid, entity picker, lenses and the compare.
import { addPropertiesToSix, openDropdown, pickReal } from "../flows";
import { addTwoPresetsAndCompare, boot, expect, nav } from "../helpers";
import {
  expectDisclosures,
  expectPanelActionsRight,
  expectRowActions,
} from "../layout/common";
import {
  expectCompareLayout,
  expectProjectionGrid,
  expectScenarioGrid,
  expectScenariosPanel,
} from "../layout/pages";
import { defineScreen, type Screen } from "./define";

export const projectionsScenariosScreens: Screen[] = [
  defineScreen(
    "30-projections",
    "Projections grid, portfolio, nominal",
    async (ux) => {
      await boot(ux.page);
      await nav(ux, "projections");
      await expectProjectionGrid(ux);
      await ux.capture();
    },
  ),
  defineScreen(
    "30b-projections-entity-open",
    "Six properties: the Projections entity picker is a dropdown, open (ADR 0157)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen(
    "32-projections-real",
    "Projections grid, real lens",
    async (ux) => {
      await boot(ux.page);
      await nav(ux, "projections");
      await pickReal(ux);
      await expectProjectionGrid(ux);
      await ux.capture({ fullPage: false });
    },
  ),
  defineScreen("40-scenarios", "Scenarios, no saved scenarios", async (ux) => {
    await boot(ux.page);
    await nav(ux, "scenarios");
    await expectCompareLayout(ux);
    // Nothing saved: the presets are open (ADR 0106, 0220).
    await expectScenariosPanel(ux, true, 0);
    await ux.capture();
  }),
  defineScreen("41-scenario-form", "New-scenario modal", async (ux) => {
    await boot(ux.page);
    await nav(ux, "scenarios");
    await ux.page
      .getByRole("button", { name: ux.t.scenarios.addScenario })
      .click();
    await expect(ux.page.getByRole("dialog")).toBeVisible();
    await ux.capture({ fullPage: false });
  }),
  defineScreen(
    "42-scenarios-compare",
    "Two stress presets added and compared with Base",
    async (ux) => {
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
      await ux.capture();
      await expectDisclosures(ux);
    },
  ),
  defineScreen(
    "43-scenarios-compare-delta",
    "Compare key figures as Δ vs Base (ADR 0097)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "45-scenario-delete-confirm",
    "Scenario delete confirm, focus on Cancel (ADR 0143)",
    async (ux) => {
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
      await ux.capture();
    },
  ),
  defineScreen(
    "44-scenario-form-errors",
    "New-scenario modal refusing a crash typed as −20 % (ADR 0123)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
    },
  ),
];
