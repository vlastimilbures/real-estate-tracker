// Shared fixture + helpers for the UX capture run. Selectors come from the app's own
// i18n dictionaries, so every screen can be captured in any language.
import {
  test as base,
  expect,
  type Page,
  type Locator,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { en, type Dictionary } from "../src/i18n/en";
import { cs } from "../src/i18n/cs";
import { ru } from "../src/i18n/ru";
import type { Route } from "../src/state/uiStore";
import { UX_DATE } from "./clock";

export type Lang = "en" | "cs" | "ru";
const DICTS: Record<Lang, Dictionary> = { en, cs, ru };

/** WCAG 2.2 AA rule set plus axe's best practices (headings, landmarks, empty table
 *  headers) for the axe scan (ADR 0157). */
const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

export interface Ux {
  page: Page;
  t: Dictionary;
  lang: Lang;
  /** Folder for this variant's output (`<run>/<lang>-<theme>-<viewport>`). */
  dir: string;
  /** Full-page PNG + axe scan under `<id>`. */
  capture: (
    id: string,
    opts?: { axe?: boolean; fullPage?: boolean },
  ) => Promise<void>;
  /** PNG only (no scan), e.g. intermediate keyboard-focus steps. */
  shot: (id: string, opts?: { fullPage?: boolean }) => Promise<void>;
  writeJson: (rel: string, data: unknown) => void;
}

export const test = base.extend<{ ux: Ux }>({
  ux: async ({ page }, provide, testInfo) => {
    const meta = testInfo.project.metadata as { lang: Lang; theme: string };
    const t = DICTS[meta.lang];
    const dir = path.join(process.env.UX_OUT!, testInfo.project.name);
    mkdirSync(path.join(dir, "axe"), { recursive: true });

    // UI prefs are read from localStorage at startup (src/state/uiStore.ts).
    await page.addInitScript(
      ({ lang, theme }) => {
        localStorage.setItem("ui.language", lang);
        localStorage.setItem("ui.theme", theme);
        localStorage.setItem("ui.sidebarCollapsed", "false");
        // Ids in creation order: rows created at the same (frozen) time sort by id, so
        // random ids would flip their order between runs (DR-180, DR-181).
        let seq = 0;
        crypto.randomUUID = () =>
          `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
        // No CSS transitions: a shot taken after one (e.g. the sidebar's
        // grid-template-columns) could land on a layout 1 px off its end state (DR-160).
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent =
            "*, *::before, *::after { transition: none !important; }";
          document.head.append(style);
        });
      },
      { lang: meta.lang, theme: meta.theme },
    );
    await page.clock.setFixedTime(new Date(UX_DATE));

    const writeJson = (rel: string, data: unknown) =>
      writeFileSync(path.join(dir, rel), JSON.stringify(data, null, 2));

    const shot: Ux["shot"] = async (id, opts) => {
      const fullPage = opts?.fullPage ?? true;
      // A full-page shot taken while scrolled paints the sticky topbar mid-image.
      if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page);
      await page.screenshot({
        path: path.join(dir, `${id}.png`),
        fullPage,
        animations: "disabled",
        caret: "hide",
      });
    };

    const capture: Ux["capture"] = async (id, opts) => {
      await shot(id, opts);
      // ADR 0214: a panel header holds context on one line at 1280 × 800 and wider.
      if ((page.viewportSize()?.width ?? 0) >= 1280) {
        // One row: the title fits one line, the hint does not push the titles past it,
        // and the head's actions sit beside the titles, not below them.
        const wrapped = await page.evaluate(() =>
          Array.from(document.querySelectorAll("section.panel"))
            .filter((p) => {
              const head = p.querySelector(":scope > .panel-head");
              const titles = head?.querySelector(".panel-head-titles");
              const h2 = titles?.querySelector("h2");
              if (!head || !titles || !h2) return false;
              const tr = titles.getBoundingClientRect();
              if (tr.height === 0) return false;
              const hr = h2.getBoundingClientRect();
              const cs = getComputedStyle(h2);
              const line =
                parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
              if (hr.height > line * 1.5) return true;
              if (tr.height > hr.height + 4) return true;
              return Array.from(head.children).some((c) => {
                if (c === titles) return false;
                const r = c.getBoundingClientRect();
                return r.height > 0 && r.top >= tr.bottom - 2;
              });
            })
            .map((p) => p.querySelector(".panel-head h2")?.textContent ?? ""),
        );
        expect(wrapped, `${id}: panel headers on one line`).toEqual([]);
      }
      if (opts?.axe === false) return;
      const res = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      writeJson(path.join("axe", `${id}.json`), {
        screen: id,
        url: res.url,
        violations: res.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.length,
          targets: v.nodes.slice(0, 12).map((n) => ({
            target: n.target.join(" "),
            summary: n.failureSummary,
          })),
        })),
        incomplete: res.incomplete.map((v) => ({
          id: v.id,
          nodes: v.nodes.length,
        })),
      });
    };

    await provide({ page, t, lang: meta.lang, dir, capture, shot, writeJson });
  },
});

export { expect };

/** Wait for fonts and for Recharts' entry animation (JS-driven, not CSS) to finish. */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // No CSS animation or transition still running (e.g. the sidebar collapsing).
  // Scroll-driven animations (pinned-column shadows) run for as long as the page
  // lives, so only time-based ones count. `animations: "disabled"` resets them, so
  // shots show no pinned-column shadow (ADR 0085).
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.timeline !== document.timeline || a.playState !== "running",
      ),
  );
  if (await page.locator(".recharts-wrapper").count()) {
    // Charts resize after layout changes (ResizeObserver): wait until every chart's
    // SVG markup is unchanged over three samples 200 ms apart (DR-147).
    let last = "";
    let same = 0;
    for (let i = 0; i < 40 && same < 3; i++) {
      await page.waitForTimeout(200);
      const now = await page.evaluate(() =>
        [...document.querySelectorAll(".recharts-wrapper")]
          .map((el) => el.innerHTML)
          .join("|"),
      );
      same = now === last ? same + 1 : 0;
      last = now;
    }
    // A shot of a chart still moving would differ from run to run (#137).
    if (same < 3) throw new Error("charts did not settle within 8 s");
  }
}

/** Open the app and wait until the sample seed has loaded. */
export async function boot(page: Page) {
  await page.goto("/");
  await expect(page.locator(".sidebar")).toBeVisible({ timeout: 30_000 });
}

const NAV_KEY: Partial<Record<Route, keyof Dictionary["nav"]>> = {
  dashboard: "dashboard",
  properties: "properties",
  projections: "projections",
  scenarios: "scenarios",
  import: "importData",
  settings: "settings",
  guide: "guide",
};

/**
 * Navigate through the sidebar, the way a user does, and wait until the clicked entry is
 * the current page: the old page's title is visible too, so it cannot be the signal (#137).
 * The wait proves nothing when the entry is already current, e.g. Properties on a
 * property detail page (AppShell marks it for both routes).
 */
export async function nav(ux: Ux, route: Route) {
  const key = NAV_KEY[route];
  if (!key) throw new Error(`route "${route}" has no sidebar entry`);
  const entry = ux.page
    .locator(".nav")
    .getByRole("button", { name: ux.t.nav[key] });
  await entry.click();
  await expect(entry).toHaveAttribute("aria-current", "page");
  await expect(ux.page.locator(".page-title")).toBeVisible();
}

/** Property detail of the first property in the list. */
export async function openFirstProperty(ux: Ux) {
  await nav(ux, "properties");
  await ux.page.locator("table.data tbody tr td.left").first().click();
  await expect(ux.page.locator(".panel-head h2").first()).toBeVisible();
}

/** A `section.panel` by its heading text. */
export function panel(ux: Ux, title: string): Locator {
  return ux.page.locator("section.panel").filter({
    has: ux.page.getByRole("heading", { name: title, exact: true }),
  });
}

export async function settingsTab(
  ux: Ux,
  tab: keyof Dictionary["settings"]["tabs"],
) {
  await nav(ux, "settings");
  await ux.page.getByRole("tab", { name: ux.t.settings.tabs[tab] }).click();
}

/**
 * Scenarios page: add the +2 pp and −20 % stress presets and tick both for the compare
 * next to Base.
 */
export async function addTwoPresetsAndCompare(ux: Ux) {
  await ux.page
    .getByRole("button", { name: ux.t.scenarios.plusPp(2), exact: true })
    .click();
  await ux.page.getByRole("button", { name: "−20,0 %", exact: true }).click();
  const picks = ux.page.locator(".scenario-row input[type=checkbox]");
  await expect(picks).toHaveCount(3);
  await picks.nth(1).check();
  await picks.nth(2).check();
}

/** Delete every property through the Properties page, leaving an empty portfolio. */
export async function deleteAllProperties(ux: Ux) {
  await nav(ux, "properties");
  const rows = ux.page.locator("table.data tbody tr");
  while ((await rows.count()) > 0) {
    await rows
      .first()
      .getByRole("button", { name: ux.t.common.delete })
      .click();
    await ux.page
      .locator(".confirm-row")
      .getByRole("button", { name: ux.t.common.yesDelete })
      .click();
    await expect(ux.page.locator(".confirm-row")).toHaveCount(0);
  }
}

/**
 * Clicks the +5y preset and checks the as-of hint's row (ADR 0198): the property chips and
 * the picker keep their place, the hint is one line at 1280 px or wider (at most two below)
 * and the page does not scroll sideways.
 */
export async function pickFiveYearsAndCheckHint(page: Page) {
  const bar = page.locator(".filter-bar").first();
  // Boxes relative to the bar: content above it (the page subtitle) may change height
  // with the date, which moves the whole bar but is not the hint's doing.
  const place = () =>
    bar.evaluate((el) => {
      const top = el.getBoundingClientRect();
      return (
        Array.from(el.children)
          // The hint's own row (ADR 0198) is not one of the bar's controls.
          .filter((c) => !c.classList.contains("asof-foot"))
          .map((c) => {
            const r = c.getBoundingClientRect();
            return {
              x: r.x - top.x,
              y: r.y - top.y,
              width: r.width,
              height: r.height,
            };
          })
      );
    });
  const before = await place();
  const preset = page.getByTestId("asof-5y");
  await preset.click();
  await expect(preset).toHaveAttribute("aria-pressed", "true");
  const hint = bar.getByTestId("asof-hint");
  await expect(hint).toBeVisible();
  expect(await place(), "chips and picker boxes").toEqual(before);
  const m = await hint.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    line: parseFloat(getComputedStyle(el).lineHeight),
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  const maxLines = m.width >= 1280 ? 1 : 2;
  expect(Math.round(m.height / m.line), "hint lines").toBeLessThanOrEqual(
    maxLines,
  );
  expect(m.scroll, "page width").toBeLessThanOrEqual(m.client);
}
