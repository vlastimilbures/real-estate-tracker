// @vitest-environment jsdom
//
// ADR 0225 §2: a section nav in one row keeps the current link in view and marks the
// side with more links.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionNav } from "../SectionNav";

const sections = ["a", "b", "c", "d"].map((id) => ({ id, label: id }));

/** Lays out the row: each link 100 px wide, the row 150 px. */
function layOut(list: HTMLElement) {
  Object.defineProperty(list, "clientWidth", {
    value: 150,
    configurable: true,
  });
  Object.defineProperty(list, "scrollWidth", {
    value: 400,
    configurable: true,
  });
  list.querySelectorAll("a").forEach((a, i) => {
    Object.defineProperty(a, "offsetLeft", { value: i * 100 });
    Object.defineProperty(a, "offsetWidth", { value: 100 });
  });
}

describe("SectionNav in one row (ADR 0225 §2)", () => {
  it("wraps unless asked: no one-row class", () => {
    render(
      <SectionNav
        label="S"
        sections={sections}
        current="a"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("navigation").classList.contains("one-row")).toBe(
      false,
    );
  });

  it("scrolls the current link into view and marks the side with more", () => {
    const { rerender } = render(
      <SectionNav
        label="S"
        sections={sections}
        current="a"
        onSelect={() => {}}
        oneRow
      />,
    );
    const nav = screen.getByRole("navigation");
    const list = screen.getByRole("list");
    layOut(list);
    rerender(
      <SectionNav
        label="S"
        sections={sections}
        current="d"
        onSelect={() => {}}
        oneRow
      />,
    );
    expect(nav.classList.contains("one-row")).toBe(true);
    // Link d spans 300–400: scrolled so it ends 24 px before the row's end.
    expect(list.scrollLeft).toBe(274);
    expect(nav.dataset.moreStart).toBe("true");
    expect(nav.dataset.moreEnd).toBe("false");
  });
});
