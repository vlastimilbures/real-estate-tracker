// @vitest-environment jsdom
//
// UX-044: metric abbreviations explain themselves in place and link to the Guide.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { MetricLabel } from "../MetricLabel";
import { Guide } from "../../pages/Guide";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";

beforeEach(() =>
  act(() =>
    useUiStore.setState({
      language: "en",
      route: "properties",
      guideTerm: null,
    }),
  ),
);

describe("MetricLabel (UX-044)", () => {
  it("shows the label with the glossary definition as its description", () => {
    render(<MetricLabel term="dscr">DSCR</MetricLabel>);
    const button = screen.getByRole("button", { name: /DSCR/ });
    expect(button.getAttribute("title")).toBe(en.guide.glossary.dscr.def);
    expect(button).toHaveProperty("type", "button");
  });

  it("opens the Guide at that term", () => {
    render(<MetricLabel term="ltv">LTV</MetricLabel>);
    fireEvent.click(screen.getByRole("button", { name: /LTV/ }));
    expect(useUiStore.getState().route).toBe("guide");
    expect(useUiStore.getState().guideTerm).toBe("ltv");
  });

  it("the Guide focuses the requested glossary entry", () => {
    act(() => useUiStore.setState({ route: "guide", guideTerm: "noi" }));
    render(<Guide />);
    const entry = document.getElementById("glossary-noi");
    expect(entry).not.toBeNull();
    expect(document.activeElement).toBe(entry);
    expect(useUiStore.getState().guideTerm).toBeNull();
  });
});
