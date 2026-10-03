// ADR 0076 (DR-175, UX-070): one app name. The bundle's productName is the name; the
// window title, the page title, the About menu item and the About subtitle follow it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { en } from "../i18n/en";
import { cs } from "../i18n/cs";
import { ru } from "../i18n/ru";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const conf = JSON.parse(read("src-tauri/tauri.conf.json")) as {
  productName: string;
  app: { windows: { title: string }[] };
};
const name = conf.productName;

describe("app name (ADR 0076)", () => {
  it("is Real Estate Tracker", () => {
    expect(name).toBe("Real Estate Tracker");
  });

  it("titles the window and the page", () => {
    expect(conf.app.windows.map((w) => w.title)).toEqual([name]);
    expect(read("index.html")).toContain(`<title>${name}</title>`);
  });

  it("names the About menu item and the About page", () => {
    expect(read("src-tauri/src/lib.rs")).toContain(`"About ${name}"`);
    for (const d of [en, cs, ru]) expect(d.about.subtitle).toBe(name);
  });
});
