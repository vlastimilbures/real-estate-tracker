// @vitest-environment jsdom
//
// ADR 0076 (DR-175, UX-070), ADR 0105 (#22): one app name. The bundle's productName is the
// name; `APP_NAME` holds it for the code, and every brand surface follows it: the window
// title, the page title, the About menu item and page, the sidebar brand, the logo title and
// the loading screen. The name is not translated.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { APP_NAME } from "../i18n";
import { en } from "../i18n/en";
import { cs } from "../i18n/cs";
import { ru } from "../i18n/ru";
import { AppShell } from "../ui/components/AppShell";
import { BrandMark } from "../ui/components/BrandMark";
import { useUiStore } from "../state/uiStore";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const conf = JSON.parse(read("src-tauri/tauri.conf.json")) as {
  productName: string;
  app: { windows: { title: string }[] };
};
const name = conf.productName;

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(join(root, p)).isDirectory())
      return f === "__tests__" ? [] : files(p);
    return [p];
  });
}

beforeEach(() => {
  act(() => useUiStore.setState({ language: "en" }));
});

describe("app name (ADR 0076)", () => {
  it("is Real Estate Tracker", () => {
    expect(name).toBe("Real Estate Tracker");
    expect(APP_NAME).toBe(name);
  });

  it("titles the window and the page", () => {
    expect(conf.app.windows.map((w) => w.title)).toEqual([name]);
    expect(read("index.html")).toContain(`<title>${name}</title>`);
  });

  it("names the About menu item and the About page", () => {
    expect(read("src-tauri/src/lib.rs")).toContain(`"About ${name}"`);
    for (const d of [en, cs, ru]) {
      expect(d.about.subtitle).toBe(name);
      expect(d.menu.about).toContain(name);
    }
  });
});

describe("brand surfaces (ADR 0105)", () => {
  it("names the loading screen in every language", () => {
    for (const d of [en, cs, ru]) expect(d.app.loadingEyebrow).toBe(name);
  });

  it("titles the logo", () => {
    const { getByRole } = render(createElement(BrandMark));
    expect(getByRole("img", { name })).toBeTruthy();
  });

  it("shows the name in the sidebar brand", () => {
    const { container } = render(
      createElement(AppShell, { title: "x", children: null }),
    );
    const mark = container.querySelector(".brand .mark");
    expect(mark?.querySelector("br")).toBeTruthy();
    // The line break reads as a space; the head's no-break spaces as plain spaces.
    const text = [...(mark?.childNodes ?? [])]
      .map((n) => (n.nodeName === "BR" ? " " : (n.textContent ?? "")))
      .join("")
      .replace(/\u00a0/g, " ");
    expect(text).toBe(name);
  });

  it("leaves no old name in the shipped sources", () => {
    const shipped = [
      ...files("src"),
      ...files("src-tauri/src"),
      "index.html",
    ].filter((p) => !/\.test\.tsx?$/.test(p));
    const hits = shipped.filter((p) =>
      read(p).includes("Real Estate Portfolio"),
    );
    expect(hits).toEqual([]);
  });
});
