// @vitest-environment jsdom
//
// Verifies the reactive useT() path end-to-end: switching uiStore.language re-renders a
// consumer with the new dictionary, and a translation actually resolves at runtime. This
// covers the live language-switch + reactivity that compilation/parity tests don't.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useT } from "../../ui/hooks/useT";
import { csPlural, ruPlural, enPlural } from "../plural";
import { useUiStore } from "../../state/uiStore";

function Probe() {
  const t = useT();
  return <div data-testid="nav">{t.nav.dashboard}</div>;
}

describe("useT reactivity", () => {
  beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

  it("renders the English default and re-renders on language switch", () => {
    render(<Probe />);
    expect(screen.getByTestId("nav").textContent).toBe("Dashboard");

    act(() => useUiStore.setState({ language: "cs" }));
    expect(screen.getByTestId("nav").textContent).toBe("Přehled");

    act(() => useUiStore.setState({ language: "ru" }));
    expect(screen.getByTestId("nav").textContent).toBe("Обзор");
  });
});

describe("plural pickers", () => {
  it("English: one vs other", () => {
    expect(enPlural(1, ["row", "rows"])).toBe("row");
    expect(enPlural(2, ["row", "rows"])).toBe("rows");
  });

  it("Czech: 1 / 2–4 / 0,5+", () => {
    const f: [string, string, string] = ["řádek", "řádky", "řádků"];
    expect(csPlural(1, f)).toBe("řádek");
    expect(csPlural(3, f)).toBe("řádky");
    expect(csPlural(5, f)).toBe("řádků");
    expect(csPlural(0, f)).toBe("řádků");
  });

  it("Russian: CLDR one/few/many incl. the 11–14 exception", () => {
    const f: [string, string, string] = ["строка", "строки", "строк"];
    expect(ruPlural(1, f)).toBe("строка");
    expect(ruPlural(2, f)).toBe("строки");
    expect(ruPlural(5, f)).toBe("строк");
    expect(ruPlural(11, f)).toBe("строк"); // exception: 11 is "many", not "one"
    expect(ruPlural(21, f)).toBe("строка");
  });
});
