// Guide, the empty portfolio, the sample and inactive or pending properties.
import {
  boot,
  clickInPlace,
  deleteAllProperties,
  expect,
  nav,
  settingsTab,
} from "../helpers";
import { expectPropertiesFit } from "../layout/pages";
import { defineScreen, type Screen } from "./define";

export const guideEmptyScreens: Screen[] = [
  defineScreen("70-guide", "Guide (full page)", async (ux) => {
    await boot(ux.page);
    // Opening the Guide from a page scrolled down lands at its top (ADR 0213 §3).
    await nav(ux, "projections");
    await ux.page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    expect(await ux.page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await nav(ux, "guide");
    await expect.poll(() => ux.page.evaluate(() => window.scrollY)).toBe(0);
    await ux.capture();
  }),
  defineScreen(
    "70b-guide-section-nav",
    "Guide: a section link lands its section under the top bar, marked current (ADR 0213)",
    async (ux) => {
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
      await ux.capture({ fullPage: false });
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
  ),
  defineScreen(
    "80-empty-portfolio",
    "Dashboard after deleting every property",
    async (ux) => {
      await boot(ux.page);
      await deleteAllProperties(ux);
      await ux.capture("80-empty-properties");
      await nav(ux, "dashboard");
      await ux.capture();
    },
  ),
  defineScreen(
    "81-clear-sample-dialog",
    "Clear sample confirmation, opened from the sample banner (ADR 0094)",
    async (ux) => {
      // Opened only: the browser build has no app backups folder for the safety backup.
      await boot(ux.page);
      await ux.page
        .getByRole("button", { name: ux.t.sample.clearAction })
        .click();
      await expect(ux.page.getByRole("dialog")).toBeVisible();
      await ux.capture();
    },
  ),
  defineScreen(
    "82-load-sample",
    "Load sample portfolio on an empty portfolio, then its banner (ADR 0112)",
    async (ux) => {
      await boot(ux.page);
      await deleteAllProperties(ux);
      await settingsTab(ux, "backup");
      const load = ux.page.getByRole("button", {
        name: ux.t.sample.loadAction,
      });
      await expect(load).toBeVisible();
      await ux.capture();
      // At `min` the button sits at the page's end: a scrolling click would flake the
      // shot below (#536).
      await clickInPlace(load);
      await expect(ux.page.getByText(ux.t.sample.loaded)).toBeVisible();
      await ux.capture("82-load-sample-loaded");
      await nav(ux, "dashboard");
      await expect(ux.page.getByText(ux.t.sample.banner)).toBeVisible();
      // The toast outlives a page change (ADR 0154); this screen shows the page.
      await expect(ux.page.locator(".toast")).toBeHidden({ timeout: 10_000 });
      await ux.capture("82-load-sample-banner");
    },
  ),
  defineScreen(
    "83-all-deactivated",
    "An inactive property's page, then every property deactivated (ADR 0155)",
    async (ux) => {
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
  ),
  defineScreen(
    "84-pending-property",
    "A future purchase: its Properties row and its page (ADR 0156)",
    async (ux) => {
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
  ),
];
