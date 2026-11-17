// Layout assertions shared by many screens: nothing clipped, panel actions, row actions
// and their tooltips, info popovers, disclosures and the left bar (ADR 0158).
import type { Locator, Page } from "@playwright/test";
import { expect, type Ux } from "../helpers";

/**
 * Fails when `el` hides part of its content: a clipped or scrolled overflow, or a child
 * that ends past its right edge. Layouts must not depend on string length (ADR 0158).
 */
export async function expectNotClipped(el: Locator) {
  const m = await el.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const ends = Array.from(
      node.children,
      (c) => c.getBoundingClientRect().right,
    );
    return {
      scroll: node.scrollWidth,
      client: node.clientWidth,
      end: Math.max(box.left, ...ends),
      right: box.right,
    };
  });
  expect(m.scroll, "content width").toBeLessThanOrEqual(m.client + 1);
  expect(m.end, "last child's right edge").toBeLessThanOrEqual(m.right + 1);
}

/**
 * Every panel head's action (a toggle or button) ends at the head's right edge, whether
 * it sits beside the title or has wrapped under it (ADR 0158).
 */
export async function expectPanelActionsRight(page: Page) {
  const actions = await page
    .locator(".panel > .panel-head")
    .evaluateAll((heads) =>
      heads.flatMap((head) => {
        const right =
          head.getBoundingClientRect().right -
          parseFloat(getComputedStyle(head).paddingRight);
        return Array.from(head.children)
          .filter((c) => !c.classList.contains("panel-head-titles"))
          .map((c) => ({
            text: c.textContent,
            gap: right - c.getBoundingClientRect().right,
          }));
      }),
    );
  for (const a of actions) {
    expect(Math.abs(a.gap), `"${a.text}" panel action`).toBeLessThanOrEqual(1);
  }
}

/**
 * Every row's actions (ADR 0199): icon-only targets of at least 24 × 24 px, 4 px apart,
 * and the actions cell at most `maxCell` px wide (about 72 px for two, 104 px for three).
 */
export async function expectRowActions(scope: Locator, maxCell: number) {
  const groups = await scope.locator(".row-actions").evaluateAll((els) =>
    els.map((el) => {
      const cell = el.closest("td, .scenario-actions") ?? el;
      const buttons = Array.from(el.querySelectorAll(".row-action"), (b) =>
        b.getBoundingClientRect(),
      );
      return {
        cell: cell.getBoundingClientRect().width,
        sizes: buttons.map((b) => Math.min(b.width, b.height)),
        gaps: buttons.slice(1).map((b, i) => b.left - buttons[i]!.right),
      };
    }),
  );
  expect(groups.length, "rows with actions").toBeGreaterThan(0);
  for (const g of groups) {
    expect(g.cell, "actions cell width").toBeLessThanOrEqual(maxCell);
    for (const s of g.sizes)
      expect(s, "target size").toBeGreaterThanOrEqual(24);
    for (const gap of g.gaps)
      expect(gap, "gap between targets").toBeGreaterThanOrEqual(4);
  }
}

/**
 * Moves keyboard focus onto `button` (Shift+Tab, Tab, so the focus is keyboard focus)
 * and checks its tooltip (ADR 0199): visible, the button's name, inside `within`.
 */
export async function expectRowActionTip(
  page: Page,
  button: Locator,
  within: Locator,
) {
  await button.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  const tip = button.locator(".row-action-tip");
  const name = await tip.textContent();
  await expect(button).toHaveAccessibleName(name ?? "");
  const box = await tip.boundingBox();
  const area = await within.boundingBox();
  expect(box && box.width > 1 && box.height > 1, "tooltip shows").toBe(true);
  expect(box!.x, "tooltip left").toBeGreaterThanOrEqual(area!.x);
  expect(box!.x + box!.width, "tooltip right").toBeLessThanOrEqual(
    area!.x + area!.width,
  );
  expect(box!.y, "tooltip top").toBeGreaterThanOrEqual(area!.y);
  expect(box!.y + box!.height, "tooltip bottom").toBeLessThanOrEqual(
    area!.y + area!.height,
  );
  // Nothing (a sticky header, a pinned cell) covers it.
  const onTop = await tip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2,
    );
    return hit === el || el.contains(hit);
  });
  expect(onTop, "tooltip not covered").toBe(true);
}

/**
 * Opens an info icon from the keyboard (ADR 0217) and checks its popover: visible,
 * holding text, inside the window, not covered; Escape hides it and keeps focus.
 */
export async function expectInfoTip(page: Page, button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await button.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const id = await button.getAttribute("aria-controls");
  const pop = page.locator(`[id="${id}"]`);
  await expect(pop).toBeVisible();
  expect(
    (await pop.textContent())?.trim().length,
    "popover text",
  ).toBeGreaterThan(0);
  const box = (await pop.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x, "popover left").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "popover right").toBeLessThanOrEqual(vp.width);
  expect(box.y, "popover top").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "popover bottom").toBeLessThanOrEqual(vp.height);
  const onTop = await pop.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2,
    );
    return hit === el || el.contains(hit);
  });
  expect(onTop, "popover not covered").toBe(true);
  // Tab moves on to the next control, not into the popover or out to the page; Shift+Tab
  // comes back (and opens it again). Needs a control after the icon: on a page where
  // the icon is the last tab stop, Tab leaves the page and this would fail.
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () =>
        document.activeElement !== document.body &&
        !document.activeElement?.closest(".info-tip-pop"),
    ),
    "Tab from the icon reaches the next control",
  ).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

/** Escape hides an open info popover and focus stays on its icon (ADR 0217). */
export async function expectInfoTipEscape(page: Page, button: Locator) {
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
}

/** One disclosure (ADR 0203): no <details>, and every expandable button names a region
 *  that is in the DOM. */
export async function expectDisclosures(ux: Ux) {
  expect(await ux.page.locator("details").count(), "no <details>").toBe(0);
  const missing = await ux.page.evaluate(() =>
    Array.from(document.querySelectorAll("button[aria-expanded]"))
      // Popup triggers (listbox, calendar) and the sidebar toggle are not disclosures.
      .filter(
        (b) =>
          !b.hasAttribute("aria-haspopup") &&
          !b.classList.contains("collapse-btn"),
      )
      .filter((b) => {
        const id = b.getAttribute("aria-controls");
        return !id || !document.getElementById(id);
      })
      .map((b) => b.textContent),
  );
  expect(missing, "disclosures without their region").toEqual([]);
}

/** The left bar (ADR 0219): the pages on top, the tools under them and above the footer,
 *  nothing overlapping and nothing cut off by the window. */
export async function expectNavGroups(ux: Ux) {
  const m = await ux.page.locator(".sidebar").evaluate((bar) => {
    const box = (sel: string) =>
      bar.querySelector(sel)!.getBoundingClientRect();
    const pages = box(".nav-group:not(.tools)");
    const tools = box(".nav-group.tools");
    const foot = box(".sidebar-foot");
    return {
      pagesBottom: pages.bottom,
      toolsTop: tools.top,
      toolsBottom: tools.bottom,
      footTop: foot.top,
      footBottom: foot.bottom,
      height: window.innerHeight,
      overflow: bar.scrollHeight - bar.clientHeight,
      tools: bar.querySelectorAll(".nav-group.tools button").length,
    };
  });
  expect(m.tools, "three tools").toBe(3);
  expect(m.toolsTop, "tools under the pages").toBeGreaterThan(m.pagesBottom);
  expect(m.toolsBottom, "tools above the footer").toBeLessThanOrEqual(
    m.footTop,
  );
  expect(m.footBottom, "footer inside the window").toBeLessThanOrEqual(
    m.height,
  );
  expect(m.overflow, "left bar not cut off").toBeLessThanOrEqual(1);
}
