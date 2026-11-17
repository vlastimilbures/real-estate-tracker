// Keyboard: Tab order from page load and focus after navigation.
import { boot, expect, nav } from "../helpers";
import { defineScreen, type Screen } from "./define";

export const keyboardScreens: Screen[] = [
  defineScreen(
    "90-keyboard-focus",
    "Keyboard-only: Tab order from page load, with focus screenshots",
    async (ux) => {
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
      expect(rowFocusable).toBe(true);
    },
  ),
  defineScreen(
    "91-nav-focus",
    "Keyboard: Enter on Properties in the sidebar moves focus to the new page's main region",
    async (ux) => {
      await boot(ux.page);
      await ux.page
        .locator(".nav")
        .getByRole("button", { name: ux.t.nav.properties })
        .focus();
      await ux.page.keyboard.press("Enter");
      await expect(ux.page.locator(".page-title")).toHaveText(
        ux.t.properties.title,
      );
      // ADR 0146: focus lands on <main>, not <body>, and Tab continues in the page.
      const afterNav = await ux.page.evaluate(() => document.activeElement?.id);
      expect(afterNav).toBe("main");
      await ux.page.keyboard.press("Tab");
      const afterTab = await ux.page.evaluate(() => {
        const el = document.activeElement;
        return {
          inMain: !!el?.closest("main"),
          tag: el?.tagName.toLowerCase() ?? "",
        };
      });
      expect(afterTab.inMain).toBe(true);
      ux.writeJson("91-nav-focus.json", { afterNav, afterTab });
      await ux.capture({ fullPage: false });
    },
  ),
];
