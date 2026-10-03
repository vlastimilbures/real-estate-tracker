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
});
