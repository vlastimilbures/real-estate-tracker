// #483, #473: the webview owns the native menu's page list and labels (model/menu.ts);
// the Rust menu (src-tauri/src/menu.rs `ITEMS`) builds the same items. Every page it lists
// has a left-bar button in the routes table, in the same order; the Rust table names the
// same pages in the same order, and sends exactly the events the webview listens for.
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MENU_EVENTS, menuLabels, menuRoute } from "../model/menu";
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

  const rust = readFileSync(
    join(__dirname, "../../../src-tauri/src/menu.rs"),
    "utf8",
  );
  /** The Rust `ITEMS` table's source. */
  const items =
    /pub const ITEMS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(rust)?.[1] ?? "";

  test("the Rust View menu names the same pages in the same order", () => {
    const pages = [...items.matchAll(/page\(\s*"nav:([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(pages).toEqual(menuPages);
  });

  test("the Rust menu sends exactly the events the webview listens for", () => {
    const events = new Set(
      [...rust.matchAll(/event:\s*"(menu:\/\/[^"]+)"/g)].map((m) => m[1]),
    );
    expect([...events].sort()).toEqual(Object.values(MENU_EVENTS).sort());
  });
});
