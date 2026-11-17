// One test per manifest entry; Playwright projects supply the lang × theme × viewport
// variants (playwright.ux.config.ts). Filter with `pnpm ux:capture --grep <id>`; the
// Czech / Russian layout run selects `--grep @layout-i18n` (layoutScreens.ts).
import { test, expect } from "./helpers";
import { LAYOUT_SCREENS, LAYOUT_TAG } from "./layoutScreens";
import { SCREENS, ROUTE_COVERAGE } from "./screens/index";

const tagsOf = (id: string) =>
  LAYOUT_SCREENS.includes(id) ? [LAYOUT_TAG] : [];

test("manifest covers every route", () => {
  const ids = new Set(SCREENS.map((s) => s.id));
  for (const [route, id] of Object.entries(ROUTE_COVERAGE)) {
    expect(ids.has(id), `route "${route}" → missing screen "${id}"`).toBe(true);
  }
});

test("screen ids are unique", () => {
  const seen = new Set<string>();
  const twice = SCREENS.map((s) => s.id).filter(
    (id) => seen.size === seen.add(id).size,
  );
  expect(twice, "screen ids used twice").toEqual([]);
});

// Runs with the layout screens, so a layout run that tagged fewer screens than the list
// fails here, not by silently capturing less.
test("layout screens are all tagged", { tag: LAYOUT_TAG }, () => {
  const tagged = SCREENS.filter((s) => tagsOf(s.id).includes(LAYOUT_TAG));
  expect(
    tagged.map((s) => s.id),
    `${LAYOUT_TAG} screens`,
  ).toHaveLength(LAYOUT_SCREENS.length);
});

for (const screen of SCREENS) {
  test(
    `${screen.id} — ${screen.desc}`,
    { tag: tagsOf(screen.id) },
    async ({ ux }) => {
      await screen.run(ux);
    },
  );
}
