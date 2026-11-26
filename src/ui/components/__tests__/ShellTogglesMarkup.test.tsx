// @vitest-environment jsdom
//
// The left bar's language and appearance controls, pinned before they are built on
// SegmentedToggle: roles, aria, classes, titles and icons, expanded and collapsed, in
// each language and theme.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLayout } from "../AppLayout";
import { PageFrame } from "../PageFrame";
import { useUiStore, type Theme } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import type { Language } from "../../../i18n";

const LANGS: Language[] = ["en", "cs", "ru"];
const THEMES: Theme[] = ["light", "dark", "system"];

beforeEach(() => {
  act(() =>
    useUiStore.setState({
      language: "en",
      theme: "system",
      sidebarCollapsed: false,
    }),
  );
});

function footer(): HTMLElement {
  const { container } = render(
    <AppLayout>
      <PageFrame title="Dashboard">
        <p>page</p>
      </PageFrame>
    </AppLayout>,
  );
  return container.querySelector(".sidebar-foot") as HTMLElement;
}

describe("the left bar's language and appearance controls", () => {
  for (const collapsed of [false, true])
    for (const language of LANGS)
      for (const theme of THEMES)
        it(`${collapsed ? "collapsed" : "expanded"}, ${language}, ${theme}`, () => {
          act(() =>
            useUiStore.setState({
              language,
              theme,
              sidebarCollapsed: collapsed,
            }),
          );
          expect(footer().innerHTML).toMatchSnapshot();
        });

  it("a segment picks its language, and another its theme", async () => {
    const user = userEvent.setup();
    const foot = footer();
    const look = within(foot).getByRole("group", { name: en.shell.appearance });
    await user.click(
      within(look).getByRole("button", { name: en.shell.themeDark }),
    );
    expect(useUiStore.getState().theme).toBe("dark");
    const lang = within(foot).getByRole("group", { name: en.shell.language });
    await user.click(within(lang).getByRole("button", { name: "CS" }));
    await vi.waitFor(() => expect(useUiStore.getState().language).toBe("cs"));
  });

  it("collapsed, each button moves on to the next language and theme", async () => {
    act(() => useUiStore.setState({ sidebarCollapsed: true, theme: "light" }));
    const user = userEvent.setup();
    footer();
    await user.click(
      screen.getByTitle(
        en.shell.themeTitle(en.shell.themeLight, en.shell.themeDark),
      ),
    );
    expect(useUiStore.getState().theme).toBe("dark");
    await user.click(screen.getByTitle(`${en.shell.language}: EN`));
    await vi.waitFor(() => expect(useUiStore.getState().language).toBe("cs"));
  });
});
