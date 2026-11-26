// @vitest-environment jsdom
//
// #600: the native menu reads "a modal is open" from the layer stack (layers.ts), so every
// aria-modal dialog must be on it as modal, and nothing else may be. A dialog that sets
// aria-modal without `modal: true` would let menu keys through behind it.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../components/Modal";
import { PropertySelect } from "../components/PropertySelect";
import { anyOpen, modalOpen } from "../layers";

const ariaModalShown = () =>
  document.querySelector('[aria-modal="true"]') !== null;

describe("modal layers match aria-modal dialogs (#600)", () => {
  it("every source file that sets aria-modal registers its layer as modal", () => {
    const root = join(__dirname, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__") walk(p);
        } else if (p.endsWith(".tsx")) files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(20);
    const withAriaModal = files.filter((f) =>
      /aria-modal/.test(readFileSync(f, "utf8")),
    );
    expect(withAriaModal.length).toBeGreaterThan(0);
    const unregistered = withAriaModal.filter(
      (f) => !/\bmodal: true\b/.test(readFileSync(f, "utf8")),
    );
    expect(unregistered).toEqual([]);
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
