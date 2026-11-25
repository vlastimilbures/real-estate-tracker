// #483: the native View menu keeps its own page list (model/menu.ts), which mirrors the
// Rust menu (src-tauri/src/menu.rs VIEW_PAGES). Every page it lists has a left-bar button
// in the routes table, in the same order, and the Rust list names the same pages in the
// same order.
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { menuLabels, menuRoute } from "../model/menu";
import { NAV_GROUPS } from "../routes";
import { en } from "../../i18n/en";

/** The menu's pages, in the order the labels are sent (MENU_ROUTES order). */
const menuPages = Object.keys(menuLabels(en).pages);
const navOrder = NAV_GROUPS.flat().map((n) => n.route);

describe("the View menu's pages match the routes table (#483)", () => {
  test("every menu page is accepted and has a left-bar button", () => {
    for (const page of menuPages) {
      expect(menuRoute(page)).toBe(page);
      expect(navOrder).toContain(page);
    }
  });

  test("the menu lists its pages in left-bar order", () => {
    expect(menuPages).toEqual(navOrder.filter((r) => menuPages.includes(r)));
  });

  test("the Rust View menu names the same pages in the same order", () => {
    const rust = readFileSync(
      join(__dirname, "../../../src-tauri/src/menu.rs"),
      "utf8",
    );
    const block = /VIEW_PAGES[^=]*=\s*\[([\s\S]*?)\];/.exec(rust)?.[1] ?? "";
    const pages = [...block.matchAll(/\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(pages).toEqual(menuPages);
  });
});
