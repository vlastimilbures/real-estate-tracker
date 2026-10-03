// README screenshots: `pnpm ux:readme`. Viewport-sized shots at 2× of the main screens on
// the fictional sample portfolio, written to docs/screenshots/<name>-<theme>.png. Uses the
// same frozen clock, seed and settling as the UX capture (helpers.ts).
import path from "node:path";
import { test, expect, boot, nav, openFirstProperty, settle } from "./helpers";
import type { Ux } from "./helpers";

const OUT = path.resolve("docs/screenshots");

async function save(ux: Ux, name: string, theme: string) {
  await ux.page.evaluate(() => window.scrollTo(0, 0));
  await expect(ux.page.locator(".toast")).toHaveCount(0, { timeout: 10_000 });
  await settle(ux.page);
  await ux.page.screenshot({
    path: path.join(OUT, `${name}-${theme}.png`),
    animations: "disabled",
    caret: "hide",
  });
}

const SHOTS: { name: string; run: (ux: Ux) => Promise<void> }[] = [
  { name: "dashboard", run: async () => {} },
  { name: "property-detail", run: (ux) => openFirstProperty(ux) },
  { name: "projections", run: (ux) => nav(ux, "projections") },
  {
    name: "scenarios",
    run: async (ux) => {
      await nav(ux, "scenarios");
      await ux.page
        .getByRole("button", { name: ux.t.scenarios.plusPp(2), exact: true })
        .click();
      await ux.page.getByRole("button", { name: "−20%", exact: true }).click();
      const picks = ux.page.locator(".scenario-row input[type=checkbox]");
      await expect(picks).toHaveCount(3);
      await picks.nth(1).check();
      await picks.nth(2).check();
    },
  },
];

for (const shot of SHOTS) {
  test(`readme ${shot.name}`, async ({ ux }, testInfo) => {
    const { theme } = testInfo.project.metadata as { theme: string };
    await boot(ux.page);
    await shot.run(ux);
    await save(ux, shot.name, theme);
  });
}
