// @vitest-environment jsdom
//
// ADR 0203 (#381): one disclosure. A quiet chevron button with aria-expanded and
// aria-controls naming a region that is always in the DOM; Enter and Space toggle it;
// no <details> left in src/ui.
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Disclosure, DisclosureButton } from "../Disclosure";

describe("DisclosureButton (ADR 0203 §1)", () => {
  it("is a quiet small button with a chevron, naming the region it controls", async () => {
    const onToggle = vi.fn();
    render(
      <>
        <DisclosureButton open={false} controls="body" onToggle={onToggle}>
          Show more
        </DisclosureButton>
        <div id="body" hidden />
      </>,
    );
    const b = screen.getByRole("button", { name: "Show more" });
    expect(b.classList.contains("ghost")).toBe(true);
    expect(b.classList.contains("sm")).toBe(true);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.getElementById(b.getAttribute("aria-controls")!),
    ).not.toBeNull();
    expect(b.querySelector("svg.lucide-chevron-down")).not.toBeNull();
    await userEvent.click(b);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("points up when open", () => {
    render(
      <DisclosureButton open controls="x" onToggle={() => undefined}>
        Hide
      </DisclosureButton>,
    );
    const b = screen.getByRole("button", { name: "Hide" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(b.querySelector("svg.lucide-chevron-up")).not.toBeNull();
  });
});

describe("Disclosure (ADR 0203 §1, §3)", () => {
  it("keeps its region in the DOM, hidden while shut; Enter and Space toggle it", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure label="By property">
        <p>Byt Dubova</p>
      </Disclosure>,
    );
    const b = screen.getByRole("button", { name: "By property" });
    const region = document.getElementById(b.getAttribute("aria-controls")!)!;
    expect(region).not.toBeNull();
    expect(region.hidden).toBe(true);
    b.focus();
    await user.keyboard("{Enter}");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(region.hidden).toBe(false);
    expect(region.textContent).toBe("Byt Dubova");
    await user.keyboard(" ");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(region.hidden).toBe(true);
  });

  it("opens by default when asked", () => {
    render(
      <Disclosure label="Will add 2" defaultOpen>
        <p>rows</p>
      </Disclosure>,
    );
    const b = screen.getByRole("button", { name: "Will add 2" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("no <details> in src/ui (ADR 0203 §4)", () => {
  it("every show/hide is the disclosure button", () => {
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
    const offenders = files.filter((f) =>
      /<details[\s>]/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
