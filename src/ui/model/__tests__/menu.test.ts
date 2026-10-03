// UX-066 (DR-143): the native View menu sends a page name; only the five pages it lists
// are accepted.
import { describe, expect, it } from "vitest";
import { menuLabels, menuRoute } from "../menu";
import { getDict } from "../../../i18n";

describe("menuRoute", () => {
  it("accepts the View menu pages", () => {
    for (const r of [
      "dashboard",
      "properties",
      "projections",
      "scenarios",
      "import",
    ])
      expect(menuRoute(r)).toBe(r);
  });

  it("refuses anything else", () => {
    for (const r of ["property", "settings", "guide", "", null, 3, {}])
      expect(menuRoute(r)).toBeNull();
  });
});

// UX-076 (DR-155): the labels the webview sends for the native menu items.
describe("menuLabels", () => {
  it("labels our items in each UI language", () => {
    expect(menuLabels(getDict("en"))).toEqual({
      about: "About Real Estate Tracker",
      settings: "Settings…",
      newProperty: "New Property…",
      pages: {
        dashboard: "Dashboard",
        properties: "Properties",
        projections: "Projections",
        scenarios: "Scenarios",
        import: "Import",
      },
    });
    expect(menuLabels(getDict("cs"))).toMatchObject({
      about: "O aplikaci Real Estate Tracker",
      settings: "Nastavení…",
      newProperty: "Nová nemovitost…",
      pages: { dashboard: "Přehled", scenarios: "Scénáře" },
    });
    expect(menuLabels(getDict("ru"))).toMatchObject({
      about: "О программе Real Estate Tracker",
      settings: "Настройки…",
      newProperty: "Новый объект…",
      pages: { dashboard: "Обзор", import: "Импорт" },
    });
  });

  it("covers exactly the View menu pages", () => {
    for (const lang of ["en", "cs", "ru"] as const)
      expect(Object.keys(menuLabels(getDict(lang)).pages)).toEqual([
        "dashboard",
        "properties",
        "projections",
        "scenarios",
        "import",
      ]);
  });
});
