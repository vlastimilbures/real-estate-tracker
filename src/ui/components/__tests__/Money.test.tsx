// @vitest-environment jsdom
//
// UX-026: amounts are coloured only where the sign carries meaning. A signed flow is
// green/red; any other amount is neutral unless negative (still red, in parentheses).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { D } from "../../../lib/money";
import { Money } from "../primitives";

const toneOf = (el: HTMLElement) =>
  [...el.querySelector(".num")!.classList].find((c) => c.startsWith("tone-"));

describe("Money tone (UX-026)", () => {
  it("a positive stock (value, debt, rent) is neutral", () => {
    const { container } = render(<Money value={D(1_000_000)} />);
    expect(toneOf(container)).toBe("tone-neutral");
  });

  it("a negative amount stays red in parentheses", () => {
    const { container } = render(<Money value={D(-5_000)} />);
    expect(toneOf(container)).toBe("tone-negative");
    expect(container.textContent).toMatch(/^\(.*\)$/);
  });

  it("a signed flow is green when positive and red when negative", () => {
    const pos = render(<Money value={D(12_000)} signed />).container;
    const neg = render(<Money value={D(-12_000)} signed />).container;
    expect(toneOf(pos)).toBe("tone-positive");
    expect(toneOf(neg)).toBe("tone-negative");
  });

  it("zero is neutral either way", () => {
    expect(toneOf(render(<Money value={D(0)} signed />).container)).toBe(
      "tone-neutral",
    );
  });

  // ADR 0178 (#186): the tone follows the value as printed, rounded to whole Kč.
  it("a value that prints 0 Kč is neutral, signed or not", () => {
    const neg = render(<Money value={D("-0.3")} />).container;
    const pos = render(<Money value={D("0.3")} signed />).container;
    expect(toneOf(neg)).toBe("tone-neutral");
    expect(neg.textContent).toBe("0 Kč");
    expect(toneOf(pos)).toBe("tone-neutral");
    expect(pos.textContent).toBe("0 Kč");
  });

  it("a value that rounds away from zero keeps its tone", () => {
    const neg = render(<Money value={D("-0.6")} />).container;
    const pos = render(<Money value={D("0.5")} signed />).container;
    expect(toneOf(neg)).toBe("tone-negative");
    expect(neg.textContent).toBe("(1 Kč)");
    expect(toneOf(pos)).toBe("tone-positive");
    expect(pos.textContent).toBe("1 Kč");
  });
});
