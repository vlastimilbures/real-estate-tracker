// @vitest-environment jsdom
//
// ADR 0213 (#390): the Guide's top bar links to each section; a link moves focus to the
// section's heading.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Guide } from "../Guide";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { ru } from "../../../i18n/ru";
import { guideSections } from "../../model/guideSections";

beforeEach(() => act(() => useUiStore.setState({ route: "guide" })));

describe("Guide section navigation (ADR 0213)", () => {
  it("names the nav and links every section, in order", () => {
    render(<Guide />);
    const nav = screen.getByRole("navigation", {
      name: en.guide.sectionNavLabel,
    });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(guideSections(en).map((s) => s.label));
    // The first section is current before any scrolling.
    expect(
      within(nav)
        .getByRole("link", { name: en.guide.howItWorksTitle })
        .getAttribute("aria-current"),
    ).toBe("location");
  });

  it("each link's section is on the page, headed by its title", () => {
    render(<Guide />);
    for (const s of guideSections(en)) {
      const section = document.getElementById(s.id);
      expect(section, s.id).not.toBeNull();
      expect(section!.querySelector("h2")?.textContent).toBe(s.label);
    }
  });

  it("a link moves focus to its section's heading and marks it current", async () => {
    render(<Guide />);
    const nav = screen.getByRole("navigation", {
      name: en.guide.sectionNavLabel,
    });
    const link = within(nav).getByRole("link", {
      name: en.guide.glossaryTitle,
    });
    await userEvent.click(link);
    expect(document.activeElement?.textContent).toBe(en.guide.glossaryTitle);
    expect(link.getAttribute("aria-current")).toBe("location");
  });

  it("is translated", () => {
    act(() => useUiStore.setState({ language: "ru" }));
    render(<Guide />);
    expect(
      screen.getByRole("navigation", { name: ru.guide.sectionNavLabel }),
    ).toBeTruthy();
  });
});

describe("in a narrow window (ADR 0225 §2)", () => {
  it("the Guide asks for one row (Property detail's wrap: SectionNavOneRow)", () => {
    render(<Guide />);
    const nav = screen.getByRole("navigation", {
      name: en.guide.sectionNavLabel,
    });
    expect(nav.classList.contains("one-row")).toBe(true);
  });
});
