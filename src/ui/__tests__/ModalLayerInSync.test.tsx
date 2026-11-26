// @vitest-environment jsdom
//
// #600: the native menu reads "a modal is open" from the layer stack (layers.ts), so every
// aria-modal dialog must be on it as modal, and nothing else may be. A dialog that sets
// aria-modal without `modal: true` would let menu keys through behind it.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../components/Modal";
import { PropertySelect } from "../components/PropertySelect";
import { anyOpen, modalOpen } from "../layers";

const ariaModalShown = () =>
  document.querySelector('[aria-modal="true"]') !== null;

type Source = { path: string; text: string };

// Comments do not count: a `modal: true` or `aria-modal` in one registers nothing.
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\/|(?<!:)\/\/[^\n]*/g, "");
const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;
// pushLayer's definition and its one caller; everything else goes through useDismiss.
const LAYER_OWNERS = ["ui/layers.ts", "ui/hooks/useDismiss.ts"];

/**
 * What breaks "every aria-modal dialog is a modal layer, and nothing else is" (#600, #614
 * review N2): per file, as many `modal: true` registrations (split over lines or not) as
 * aria-modal dialogs, and pushLayer called only from useDismiss.
 */
function modalLayerProblems(sources: Source[]): string[] {
  return sources.flatMap(({ path, text }) => {
    const body = code(text);
    const dialogs = count(body, /aria-modal/g);
    const layers = count(body, /\bmodal\s*:\s*true\b/g);
    const problems =
      dialogs === layers
        ? []
        : [`${path}: ${dialogs} aria-modal, ${layers} modal: true`];
    if (!LAYER_OWNERS.includes(path) && /\bpushLayer\b/.test(body))
      problems.push(`${path}: pushLayer outside useDismiss`);
    return problems;
  });
}

/** Every .ts/.tsx file under src, tests left out. */
function appSources(): Source[] {
  const root = join(__dirname, "..", "..");
  const out: Source[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "__tests__") walk(p);
      } else if (/\.tsx?$/.test(p) && !p.endsWith(".d.ts"))
        out.push({ path: relative(root, p), text: readFileSync(p, "utf8") });
    }
  };
  walk(root);
  return out;
}

const src = (path: string, ...lines: string[]): Source => ({
  path,
  text: lines.join("\n"),
});

describe("modal layers match aria-modal dialogs (#600)", () => {
  it("every source file that sets aria-modal registers its layer as modal", () => {
    const sources = appSources();
    expect(
      sources.filter((s) => s.path.endsWith(".tsx")).length,
    ).toBeGreaterThan(20);
    expect(sources.some((s) => /aria-modal/.test(s.text))).toBe(true);
    expect(modalLayerProblems(sources)).toEqual([]);
  });

  // #614 review N2: shapes the scan let through.
  it.each([
    [
      "a .ts file that sets aria-modal",
      src(
        "ui/hooks/useSheet.ts",
        'export const sheet = { role: "dialog", "aria-modal": true };',
      ),
    ],
    [
      "modal: true only in a comment",
      src(
        "ui/components/Sheet.tsx",
        "// modal: true",
        'useDismiss(close, { escape: "top", modal: false });',
        '<div aria-modal="true" />',
      ),
    ],
    [
      "two aria-modal dialogs, one modal layer",
      src(
        "ui/components/Two.tsx",
        "useModalA11y(a, { modal: true });",
        "useModalA11y(b, {});",
        '<div aria-modal="true" />',
        '<div aria-modal="true" />',
      ),
    ],
    [
      "a modal layer with no aria-modal dialog",
      src(
        "ui/components/Popover.tsx",
        'useDismiss(close, { escape: "top", modal: true });',
      ),
    ],
    [
      "pushLayer through an alias, outside useDismiss",
      src(
        "ui/components/Sheet.tsx",
        'import { pushLayer as push } from "../layers";',
        "const layer = push({ modal: false }); // modal: true",
        '<div aria-modal="true" />',
      ),
    ],
  ])("reports %s", (_, source) => {
    expect(modalLayerProblems([source])).not.toEqual([]);
  });

  it("accepts a registration and a dialog split over lines", () => {
    const multiLine = src(
      "ui/components/Sheet.tsx",
      "useModalA11y(close, {",
      "  trap: true,",
      "  modal:",
      "    true,",
      "});",
      "<div",
      '  role="dialog"',
      '  aria-modal="true"',
      "/>",
    );
    expect(modalLayerProblems([multiLine])).toEqual([]);
  });

  it("an open Modal is a modal layer while it shows", () => {
    expect(modalOpen()).toBe(false);
    const { unmount } = render(
      <Modal titleId="t" title="Dialog" onClose={() => {}} closeLabel="Close">
        Body
      </Modal>,
    );
    expect(ariaModalShown()).toBe(true);
    expect(modalOpen()).toBe(true);
    unmount();
    expect(ariaModalShown()).toBe(false);
    expect(modalOpen()).toBe(false);
  });

  it("an open dropdown list is a layer, not a modal one", async () => {
    render(
      <PropertySelect
        mode="single"
        options={["a", "b", "c", "d", "e", "f"].map((v) => ({
          value: v,
          label: `Flat ${v}`,
        }))}
        selected="a"
        onChange={() => {}}
        ariaLabel="Property"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Property/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(anyOpen()).toBe(true);
    expect(ariaModalShown()).toBe(false);
    expect(modalOpen()).toBe(false);
  });
});
