// @vitest-environment jsdom
//
// ADR 0114 (#24): the first tab stop skips the sidebar and topbar to the page content.
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SkipLink } from "../SkipLink";
import { useUiStore } from "../../../state/uiStore";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

function page() {
  return render(
    <>
      <SkipLink />
      <button type="button">Sidebar</button>
      <main id="main" tabIndex={-1}>
        Content
      </main>
    </>,
  );
}

describe("SkipLink", () => {
  it("is a button, so WebKit's Tab stops on it", () => {
    page();
    const skip = screen.getByRole("button", { name: "Skip to content" });
    expect(skip.getAttribute("type")).toBe("button");
  });

  it("moves focus to main and leaves the URL alone", () => {
    page();
    const before = window.location.href;
    fireEvent.click(screen.getByRole("button", { name: "Skip to content" }));
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(window.location.href).toBe(before);
  });

  it.each([
    ["cs", "Přeskočit na obsah"],
    ["ru", "Перейти к содержимому"],
  ] as const)("is translated (%s)", (language, name) => {
    act(() => useUiStore.setState({ language }));
    page();
    expect(screen.getByRole("button", { name })).toBeTruthy();
  });
});
