// @vitest-environment jsdom
//
// #350 (ADR 0194): the stale-data and edit-error banners are read aloud only on the page
// where they first show. Each page mounts its own shell; a later page shows the banner
// without a live role. A new edit error, or the data turning stale again, is announced.
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AppShell } from "../AppShell";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { WriteError } from "../../../state/writeError";
import { describeWriteError } from "../../model/writeError";

const en = getDict("en");

/** A page change: the old page's shell goes, the new page mounts its own. */
function page(title: string) {
  return render(
    <AppShell title={title}>
      <p>{title}</p>
    </AppShell>,
  );
}

/** The live role of the banner showing `text`, or null. */
const role = (text: string) =>
  screen.getByText(text).closest(".error-banner")!.getAttribute("role");
const writeError = (message: string): WriteError => ({
  kind: "other",
  message,
});

beforeEach(() =>
  act(() => {
    useUiStore.setState({ language: "en", route: "dashboard" });
    usePortfolioStore.setState({
      stale: false,
      staleEpisode: null,
      error: null,
    });
  }),
);

describe("kept app banners announce once (#350)", () => {
  it("the stale banner is live on its first page only, and again for a new episode", () => {
    act(() => usePortfolioStore.setState({ stale: true, staleEpisode: {} }));
    const first = page("One");
    expect(role(en.common.staleData)).toBe("alert");
    first.unmount();

    const second = page("Two");
    expect(role(en.common.staleData)).toBeNull();

    // A successful reload ends the episode; the next failed one is announced.
    act(() => usePortfolioStore.setState({ stale: false }));
    act(() => usePortfolioStore.setState({ stale: true, staleEpisode: {} }));
    expect(role(en.common.staleData)).toBe("alert");
    second.unmount();

    page("Three");
    expect(role(en.common.staleData)).toBeNull();
  });

  it("the edit-error banner is live on its first page only, and again for a new error", () => {
    const message = describeWriteError(en, writeError("disk full")).message;
    act(() => usePortfolioStore.setState({ error: writeError("disk full") }));
    const first = page("One");
    expect(role(message)).toBe("alert");
    first.unmount();

    const second = page("Two");
    expect(role(message)).toBeNull();

    act(() => usePortfolioStore.setState({ error: writeError("disk full") }));
    expect(role(message)).toBe("alert");
    second.unmount();

    page("Three");
    expect(role(message)).toBeNull();
  });
});
