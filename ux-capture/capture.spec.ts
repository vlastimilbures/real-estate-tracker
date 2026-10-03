// One test per manifest entry; Playwright projects supply the lang × theme × viewport
// variants (playwright.ux.config.ts). Filter with `pnpm ux:capture --grep <id>`.
import { test, expect } from "./helpers";
import { SCREENS, ROUTE_COVERAGE } from "./screens";

test("manifest covers every route", () => {
  const ids = new Set(SCREENS.map((s) => s.id));
  for (const [route, id] of Object.entries(ROUTE_COVERAGE)) {
    expect(ids.has(id), `route "${route}" → missing screen "${id}"`).toBe(true);
  }
});

for (const screen of SCREENS) {
  test(`${screen.id} — ${screen.desc}`, async ({ ux }) => {
    await screen.run(ux);
  });
}
