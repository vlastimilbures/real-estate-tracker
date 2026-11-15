// @vitest-environment jsdom
//
// ADR 0195 (#373): a health marker is a shape in the band's colour, one shape per band so
// greyscale still tells them apart; the band word is visible (labelled form) or
// screen-reader text plus a tooltip (compact form).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HealthMarker } from "../primitives";
import { BAND_SHAPE, type Band } from "../../model/health";

const BANDS: Band[] = ["good", "warn", "bad", "neutral"];

describe("BAND_SHAPE (ADR 0195 §1)", () => {
  it("gives every band its own shape", () => {
    expect(BAND_SHAPE).toEqual({
      good: "circle",
      warn: "triangle",
      bad: "diamond",
      neutral: "ring",
    });
    expect(new Set(BANDS.map((b) => BAND_SHAPE[b])).size).toBe(BANDS.length);
  });
});

describe.each(BANDS)("HealthMarker, %s band", (band) => {
  it("draws its shape, hidden from assistive technology", () => {
    const { container } = render(<HealthMarker band={band} word="Word" />);
    const marker = container.querySelector(".health-marker")!;
    expect(marker.classList.contains(band)).toBe(true);
    const svg = marker.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("data-shape")).toBe(BAND_SHAPE[band]);
  });

  it("compact form: the word is screen-reader text and a tooltip", () => {
    const { container } = render(<HealthMarker band={band} word="Word" />);
    const marker = container.querySelector(".health-marker")!;
    expect(marker.getAttribute("title")).toBe("Word");
    expect(marker.querySelector(".sr-only")?.textContent).toBe(" Word");
    expect(marker.textContent).toBe(" Word");
  });

  it("labelled form: the word is visible, with no tooltip", () => {
    const { container } = render(
      <HealthMarker band={band} word="Word" showWord />,
    );
    const marker = container.querySelector(".health-marker")!;
    expect(marker.getAttribute("title")).toBeNull();
    expect(marker.querySelector(".sr-only")).toBeNull();
    expect(marker.querySelector(".health-word")?.textContent).toBe("Word");
  });
});
