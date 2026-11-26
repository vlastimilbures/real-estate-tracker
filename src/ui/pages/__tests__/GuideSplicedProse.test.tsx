// @vitest-environment jsdom
//
// #488: the Guide's paragraphs with emphasis and formulas in them render the same markup
// and text in every language. The snapshot was written from the paragraphs as they were
// spliced from Pre/Mid/Post fragments; a refactor of their dictionary entries keeps it.
import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { Guide } from "../Guide";
import { useUiStore } from "../../../state/uiStore";
import { guideSectionId } from "../../model/guideSections";

const PARAGRAPHS = [
  ["mortgages", 0],
  ["mortgages", 1],
  ["nominalReal", 0],
  ["development", 0],
] as const;

describe.each(["en", "cs", "ru"] as const)("Guide prose (%s)", (lang) => {
  it("renders each paragraph with its emphasis and formulas", () => {
    act(() => useUiStore.setState({ route: "guide", language: lang }));
    const { container } = render(<Guide />);
    const html = PARAGRAPHS.map(([section, n]) => {
      const panel = container.querySelector(`#${guideSectionId(section)}`)!;
      return panel.querySelectorAll("p.guide-prose")[n]!.outerHTML;
    });
    expect(html).toMatchSnapshot();
  });
});
